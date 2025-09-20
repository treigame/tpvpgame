import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// WebSocket接続
const ws = new WebSocket(`wss://${window.location.host}`);
let myId = null;
let players = {};
let redItems = {}; // 赤いアイテム（オーブの代替）
let snowballs = {}; // 投げられた雪玉
let oniId = null;
let isConnected = false;
let canThrowSnowball = false; // 雪玉を投げられるかどうか
let showExclamation = false; // ！マークを表示するかどうか

// ゲーム状態の管理
let gameState = {
    score: 0,
    redItemsCollected: 0, // 収集した赤いアイテムの数
    timeAsOni: 0,
    timeAlive: 0,
    gameStartTime: Date.now(),
    oniStartTime: null,
    minimapCanvas: null,
    minimapCtx: null
};

// 設定とジョイスティックの状態
let isTabletMode = false;
let joystickActive = false;
let joystickPosition = { x: 0, y: 0 };
let playerRank = null; // プレイヤーのランク
let isFlying = false; // 飛行状態

ws.onopen = () => {
    console.log('WebSocket接続が確立されました。');
    isConnected = true;
    ws.send(JSON.stringify({ type: 'get_id' }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('受信したメッセージ:', data.type, data);
    
    if (data.type === 'init') {
        myId = data.id;
        oniId = data.oniId;
        console.log(`割り当てられたID: ${myId}`);
        console.log(`受信した赤いアイテム数: ${Object.keys(data.redItems || {}).length}`);
        
        // UI初期化
        createUI();
        createSettingsUI();
        
        // 鬼の開始時間を記録
        if (myId === oniId) {
            gameState.oniStartTime = Date.now();
            addSword(camera);
        }
        
        for (const id in data.players) {
            if (id !== myId) {
                createPlayerMesh(id, data.players[id]);
            }
        }
        
        // 赤いアイテムの作成（デバッグ情報付き）
        console.log('赤いアイテム作成開始...');
        for (const id in data.redItems || {}) {
            console.log(`赤いアイテム作成: ${id}`, data.redItems[id]);
            createRedItemMesh(id, data.redItems[id]);
        }
        console.log(`赤いアイテム作成完了: ${Object.keys(redItems).length}個`);
        
        updateUI();
    } else if (data.type === 'player_update') {
        if (data.id !== myId) {
            if (!players[data.id]) {
                createPlayerMesh(data.id, data);
            }
            players[data.id].position.set(data.x, data.y, data.z);
        }
    } else if (data.type === 'remove_player') {
        if (players[data.id]) {
            scene.remove(players[data.id]);
            delete players[data.id];
        }
    } else if (data.type === 'red_item_collected') {
        if (redItems[data.itemId]) {
            scene.remove(redItems[data.itemId]);
            delete redItems[data.itemId];
        }
        if (data.playerId === myId) {
            gameState.redItemsCollected++;
            gameState.score += 10;
            
            // 8個集めたら雪玉投擲可能
            if (gameState.redItemsCollected >= 8) {
                canThrowSnowball = true;
                showMessage('雪玉が投げられるようになりました！クリックで投擲', 'success', 3000);
            }
        }
    } else if (data.type === 'snowball_thrown') {
        createSnowballMesh(data.snowballId, data.snowball);
    } else if (data.type === 'snowball_hit') {
        if (snowballs[data.snowballId]) {
            scene.remove(snowballs[data.snowballId]);
            delete snowballs[data.snowballId];
        }
        if (data.hitPlayerId === oniId) {
            showMessage('雪玉が鬼に命中！ゲームオーバー！', 'success', 5000);
            // ゲームオーバー処理
            setTimeout(() => {
                location.reload(); // ページリロード
            }, 3000);
        }
    } else if (data.type === 'items_respawned') {
        // 既存の赤いアイテムを削除
        for (const id in redItems) {
            scene.remove(redItems[id]);
        }
        redItems = {};
        
        // 新しい赤いアイテムを追加
        for (const id in data.redItems) {
            createRedItemMesh(id, data.redItems[id]);
        }
    } else if (data.type === 'item_respawned') {
        // 単体アイテムの再出現
        console.log(`アイテム再出現: ${data.itemId}`, data.item);
        createRedItemMesh(data.itemId, data.item);
    } else if (data.type === 'show_exclamation') {
        if (data.playerId === myId && myId !== oniId) {
            showExclamation = true;
            showExclamationMark();
        }
    } else if (data.type === 'hide_exclamation') {
        if (data.playerId === myId) {
            showExclamation = false;
            hideExclamationMark();
        }
    } else if (data.type === 'oni_changed') {
        const oldOni = oniId;
        oniId = data.oniId;
        console.log(`鬼が交代しました: ${oniId}`);
        
        // 鬼時間の記録
        if (oldOni === myId && gameState.oniStartTime) {
            gameState.timeAsOni += Date.now() - gameState.oniStartTime;
            gameState.oniStartTime = null;
        }
        if (oniId === myId) {
            gameState.oniStartTime = Date.now();
        }
        
        // 剣の管理
        if (oldOni === myId) {
            removeSword(camera);
        } else if (players[oldOni] && players[oldOni].sword) {
            removeSword(players[oldOni]);
        }
        
        if (oniId === myId) {
            addSword(camera);
            // 鬼になったら雪玉投擲無効
            canThrowSnowball = false;
            gameState.redItemsCollected = 0;
        } else if (players[oniId] && !players[oniId].sword) {
            addSword(players[oniId]);
        }
        
        // プレイヤーの色を更新
        updatePlayerColors();
        updateUI();
    } else if (data.type === 'player_rank_updated') {
        // プレイヤーのランク更新
        if (data.playerId !== myId && players[data.playerId]) {
            if (data.rank) {
                addRankDisplay(players[data.playerId], data.rank);
            } else {
                removeRankDisplay(players[data.playerId]);
            }
        }
    }
};

ws.onclose = () => {
    console.log('WebSocket接続が切断されました。');
    isConnected = false;
};

ws.onerror = (error) => {
    console.error('WebSocket エラー:', error);
    isConnected = false;
};

// Three.jsシーンのセットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(20, 50, 20);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.left = -100;
directionalLight.shadow.camera.right = 100;
directionalLight.shadow.camera.top = 100;
directionalLight.shadow.camera.bottom = -100;
scene.add(directionalLight);

// チェッカーパターンの地面
const planeGeometry = new THREE.PlaneGeometry(200, 200, 20, 20);
const textureCanvas = document.createElement('canvas');
textureCanvas.width = 512;
textureCanvas.height = 512;
const ctx = textureCanvas.getContext('2d');
const tileSize = 32;
for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 16; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#666666' : '#333333';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
}
const planeTexture = new THREE.CanvasTexture(textureCanvas);
planeTexture.wrapS = THREE.RepeatWrapping;
planeTexture.wrapT = THREE.RepeatWrapping;
planeTexture.repeat.set(10, 10);

const planeMaterial = new THREE.MeshStandardMaterial({ 
    map: planeTexture,
    roughness: 0.8,
    metalness: 0.1
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1;
plane.receiveShadow = true;
scene.add(plane);

// 建物の作成（鬼ごっこ用の面白い建物）
function createBuildings() {
    const buildings = [];
    
    // 床と同じチェッカーパターンの材質を使用
    const buildingMaterial = new THREE.MeshStandardMaterial({ 
        map: planeTexture,
        roughness: 0.8,
        metalness: 0.1
    });
    
    // 色のバリエーション
    const colors = [
        0x8B4513, // 茶色
        0x654321, // ダークブラウン
        0xA0522D, // シエナ
        0xD2691E, // チョコレート
        0xB8860B, // ダークゴールデンロッド
        0x228B22, // フォレストグリーン
        0x32CD32, // ライムグリーン
        0x006400  // ダークグリーン
    ];
    
    // 建物の配置パターン（鬼ごっこに適した設計）
    const buildingData = [
        // 中央の大きな迷路建物
        { x: 0, z: 0, type: 'maze' },
        
        // コーナーの塔
        { x: 60, z: 60, type: 'tower' },
        { x: -60, z: 60, type: 'tower' },
        { x: 60, z: -60, type: 'tower' },
        { x: -60, z: -60, type: 'tower' },
        
        // L字型建物
        { x: 30, z: 0, type: 'lshape' },
        { x: -30, z: 0, type: 'lshape' },
        { x: 0, z: 30, type: 'lshape' },
        { x: 0, z: -30, type: 'lshape' },
        
        // 小さな隠れ家
        { x: 45, z: 20, type: 'hideout' },
        { x: -45, z: 20, type: 'hideout' },
        { x: 45, z: -20, type: 'hideout' },
        { x: -45, z: -20, type: 'hideout' },
        { x: 20, z: 45, type: 'hideout' },
        { x: -20, z: 45, type: 'hideout' },
        { x: 20, z: -45, type: 'hideout' },
        { x: -20, z: -45, type: 'hideout' }
    ];
    
    buildingData.forEach((building, index) => {
        const colorIndex = index % colors.length;
        const coloredMaterial = buildingMaterial.clone();
        coloredMaterial.color.setHex(colors[colorIndex]);
        
        let buildingGroup;
        
        switch (building.type) {
            case 'maze':
                buildingGroup = createMazeBuilding(coloredMaterial);
            case 'ShiftLeft':
        case 'ShiftRight':
            // OWNER専用：飛行中はShiftで下降
            if (playerRank === 'OWNER' && isFlying) {
                velocity.y -= 12;
            }
            break;
            case 'tower':
                buildingGroup = createTowerBuilding(coloredMaterial);
                break;
            case 'lshape':
                buildingGroup = createLShapeBuilding(coloredMaterial);
                break;
            case 'hideout':
                buildingGroup = createHideoutBuilding(coloredMaterial);
                break;
        }
        
        if (buildingGroup) {
            buildingGroup.position.set(building.x, 0, building.z);
            scene.add(buildingGroup);
            buildings.push(buildingGroup);
        }
    });
    
    console.log('鬼ごっこ用建物を作成しました:', buildings.length + '個');
    return buildings;
}

// 迷路建物の作成
function createMazeBuilding(material) {
    const group = new THREE.Group();
    const wallHeight = 8;
    const wallThickness = 1;
    
    // 外壁
    const walls = [
        { x: 0, z: -15, w: 30, h: wallHeight, d: wallThickness },
        { x: 0, z: 15, w: 30, h: wallHeight, d: wallThickness },
        { x: -15, z: 0, w: wallThickness, h: wallHeight, d: 30 },
        { x: 15, z: 0, w: wallThickness, h: wallHeight, d: 30 }
    ];
    
    // 内部の迷路壁
    const mazeWalls = [
        { x: -7, z: -7, w: 8, h: wallHeight, d: wallThickness },
        { x: 7, z: 7, w: 8, h: wallHeight, d: wallThickness },
        { x: -7, z: 7, w: wallThickness, h: wallHeight, d: 8 },
        { x: 7, z: -7, w: wallThickness, h: wallHeight, d: 8 },
        { x: 0, z: 0, w: 6, h: wallHeight, d: wallThickness }
    ];
    
    [...walls, ...mazeWalls].forEach(wall => {
        const geometry = new THREE.BoxGeometry(wall.w, wall.h, wall.d);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(wall.x, wall.h/2, wall.z);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        group.add(mesh);
    });
    
    return group;
}

// 塔建物の作成
function createTowerBuilding(material) {
    const group = new THREE.Group();
    
    // 3層の塔
    for (let i = 0; i < 3; i++) {
        const size = 8 - i * 1.5;
        const height = 6;
        const y = i * height;
        
        const geometry = new THREE.BoxGeometry(size, height, size);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, y + height/2, 0);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        group.add(mesh);
        
        // 各層に窓の開口部を作る（見た目のみ）
        if (i < 2) {
            const openingGeometry = new THREE.BoxGeometry(size + 0.1, 2, 2);
            const openingMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x000000,
                transparent: true,
                opacity: 0.8
            });
            const opening = new THREE.Mesh(openingGeometry, openingMaterial);
            opening.position.set(0, y + height/2, 0);
            group.add(opening);
        }
    }
    
    return group;
}

// L字型建物の作成
function createLShapeBuilding(material) {
    const group = new THREE.Group();
    const height = 6;
    
    // L字の縦部分
    const vertical = new THREE.Mesh(
        new THREE.BoxGeometry(6, height, 12),
        material
    );
    vertical.position.set(0, height/2, 3);
    vertical.receiveShadow = true;
    vertical.castShadow = true;
    group.add(vertical);
    
    // L字の横部分
    const horizontal = new THREE.Mesh(
        new THREE.BoxGeometry(12, height, 6),
        material
    );
    horizontal.position.set(3, height/2, -3);
    horizontal.receiveShadow = true;
    horizontal.castShadow = true;
    group.add(horizontal);
    
    return group;
}

// 隠れ家建物の作成
function createHideoutBuilding(material) {
    const group = new THREE.Group();
    const height = 4;
    
    const geometry = new THREE.BoxGeometry(5, height, 5);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, height/2, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    
    return group;
}

// 外周の壁と障害物の作成
const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
});

const walls = [];
const blocks = []; // ブロック衝突判定用

// 外周の壁
const wall1 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, 2), wallMaterial);
wall1.position.set(0, (WALL_HEIGHT / 2) - 1, -WALL_SIZE / 2);
wall1.receiveShadow = true;
wall1.castShadow = true;
scene.add(wall1);
walls.push(wall1);

const wall2 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, 2), wallMaterial);
wall2.position.set(0, (WALL_HEIGHT / 2) - 1, WALL_SIZE / 2);
wall2.receiveShadow = true;
wall2.castShadow = true;
scene.add(wall2);
walls.push(wall2);

const wall3 = new THREE.Mesh(new THREE.BoxGeometry(2, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall3.position.set(-WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall3.receiveShadow = true;
wall3.castShadow = true;
scene.add(wall3);
walls.push(wall3);

const wall4 = new THREE.Mesh(new THREE.BoxGeometry(2, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall4.position.set(WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall4.receiveShadow = true;
wall4.castShadow = true;
scene.add(wall4);
walls.push(wall4);

// ブロック障害物を作成
const gameBuildings = createBuildings();
blocks.push(...gameBuildings);

// UIエレメントの作成
function createUI() {
    const uiContainer = document.createElement('div');
    uiContainer.id = 'game-ui';
    uiContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        color: white;
        font-family: 'Arial', sans-serif;
        font-size: 16px;
        z-index: 1000;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.7);
        padding: 15px;
        border-radius: 10px;
        border: 2px solid #00ff00;
        min-width: 200px;
    `;
    
    uiContainer.innerHTML = `
        <div id="player-info">
            <div>プレイヤー: <span id="player-id">${myId}</span></div>
            <div>役割: <span id="role">${myId === oniId ? '👹 鬼' : '🏃 逃走者'}</span></div>
            <div>スコア: <span id="score">${gameState.score}</span></div>
            <div id="red-items-count" style="display: ${myId !== oniId ? 'block' : 'none'}">
                赤いアイテム: <span id="red-items">${gameState.redItemsCollected}</span>/8
            </div>
            <div id="snowball-status" style="display: ${canThrowSnowball ? 'block' : 'none'}; color: #8a2be2;">
                雪玉投擲可能！
            </div>
        </div>
        <div id="timer-info" style="margin-top: 10px;">
            <div>ゲーム時間: <span id="game-time">00:00</span></div>
            <div id="oni-time" style="display: ${myId === oniId ? 'block' : 'none'}">
                鬼時間: <span id="oni-duration">00:00</span>
            </div>
        </div>
        <div id="instructions" style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            <div>W: 後退 | S: 前進 | A: 右移動 | D: 左移動 | Space: ジャンプ</div>
            <div>マウス: 視点移動 | クリック: 雪玉投擲/鬼交代</div>
            <div>🔴赤いアイテム8個で雪玉投擲可能 🧱ブロック探索</div>
        </div>
    `;
    
    document.body.appendChild(uiContainer);
    createMinimap();
}

// ミニマップの作成
function createMinimap() {
    const minimapContainer = document.createElement('div');
    minimapContainer.id = 'minimap';
    minimapContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 150px;
        height: 150px;
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid #ffffff;
        border-radius: 10px;
        z-index: 1000;
    `;
    
    const canvas = document.createElement('canvas');
    canvas.width = 146;
    canvas.height = 146;
    canvas.style.cssText = `
        position: absolute;
        top: 2px;
        left: 2px;
        border-radius: 8px;
    `;
    
    minimapContainer.appendChild(canvas);
    document.body.appendChild(minimapContainer);
    
    gameState.minimapCanvas = canvas;
    gameState.minimapCtx = canvas.getContext('2d');
}

// プレイヤーメッシュ
function createPlayerMesh(id, data) {
    const group = new THREE.Group();
    
    // 胴体
    const bodyGeometry = new THREE.CapsuleGeometry(0.8, 1.6);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: id === oniId ? 0x0000ff : 0x00ff00,
        roughness: 0.4,
        metalness: 0.1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    group.add(body);
    group.bodyMesh = body;
    
    // 頭
    const headGeometry = new THREE.SphereGeometry(0.5);
    const headMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffdbac,
        roughness: 0.6,
        metalness: 0.0
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);
    
    group.position.set(data.x, data.y, data.z);
    scene.add(group);
    players[id] = group;
    
    if (id === oniId) {
        addSword(group);
    }
    
    return group;
}

// プレイヤーの色を更新
function updatePlayerColors() {
    for (const id in players) {
        const player = players[id];
        if (player.bodyMesh) {
            player.bodyMesh.material.color.setHex(id === oniId ? 0x0000ff : 0x00ff00);
        }
    }
}

// 剣を追加する関数（右下から持つように修正）
function addSword(mesh) {
    if (mesh.sword) return;
    
    const swordGroup = new THREE.Group();
    
    // 刃
    const bladeGeometry = new THREE.BoxGeometry(0.1, 0.1, 1.5);
    const bladeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xc0c0c0,
        metalness: 0.8,
        roughness: 0.2
    });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.z = -0.75;
    blade.castShadow = true;
    swordGroup.add(blade);
    
    // 柄
    const handleGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.5);
    const handleMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513,
        roughness: 0.8,
        metalness: 0.1
    });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.z = 0.25;
    handle.rotation.x = Math.PI / 2;
    handle.castShadow = true;
    swordGroup.add(handle);
    
    // 右下から持つ位置に変更
    swordGroup.position.set(1.0, -1.2, -0.5); // 右下の位置
    swordGroup.rotation.x = Math.PI / 4; // 斜め下向き
    swordGroup.rotation.y = -Math.PI / 6; // 少し内側向き
    
    mesh.add(swordGroup);
    mesh.sword = swordGroup;
}

// 剣を削除する関数
function removeSword(mesh) {
    if (mesh.sword) {
        mesh.remove(mesh.sword);
        mesh.sword = null;
    }
}

// ランク表示を追加する関数
function addRankDisplay(mesh, rank) {
    if (mesh.rankDisplay) return;
    
    const rankGroup = new THREE.Group();
    
    // ランク背景（赤い円）
    const bgGeometry = new THREE.RingGeometry(0, 1.2, 16);
    const bgMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.rotation.x = -Math.PI / 2;
    rankGroup.add(bgMesh);
    
    // テキスト用のキャンバスを作成
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // テキストを描画
    context.fillStyle = '#ffffff';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.fillText(rank, 128, 40);
    
    // テクスチャとしてキャンバスを使用
    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        alphaTest: 0.1
    });
    
    // テキスト平面を作成
    const textGeometry = new THREE.PlaneGeometry(2, 0.5);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.y = 0.1;
    rankGroup.add(textMesh);
    
    // プレイヤーの頭上に配置
    rankGroup.position.set(0, 3.5, 0);
    
    // カメラの方向を向くように設定
    rankGroup.lookAt(camera.position);
    
    mesh.add(rankGroup);
    mesh.rankDisplay = rankGroup;
}

// ランク表示を削除する関数
function removeRankDisplay(mesh) {
    if (mesh.rankDisplay) {
        mesh.remove(mesh.rankDisplay);
        mesh.rankDisplay = null;
    }
}

// 赤いアイテムメッシュの作成（再出現対応）
function createRedItemMesh(id, data) {
    console.log(`赤いアイテムメッシュ作成: ${id}`, data);
    
    const geometry = new THREE.SphereGeometry(1.0, 16, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    mesh.castShadow = true;
    
    // 光源も追加して更に目立たせる
    const pointLight = new THREE.PointLight(0xff0000, 2, 10);
    pointLight.position.copy(mesh.position);
    scene.add(pointLight);
    mesh.userData.light = pointLight;
    
    scene.add(mesh);
    redItems[id] = mesh;
    
    // 出現エフェクト
    mesh.scale.set(0.1, 0.1, 0.1);
    const startTime = Date.now();
    function appearEffect() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / 1000, 1); // 1秒で出現
        
        const scale = 0.1 + (progress * 0.9);
        mesh.scale.set(scale, scale, scale);
        
        if (progress < 1) {
            requestAnimationFrame(appearEffect);
        }
    }
    appearEffect();
    
    console.log(`赤いアイテム ${id} を位置 (${data.x}, ${data.y}, ${data.z}) に作成しました`);
    
    return mesh;
}

// 雪玉メッシュの作成
function createSnowballMesh(id, data) {
    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x8a2be2, // 紫色
        roughness: 0.8,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    mesh.castShadow = true;
    scene.add(mesh);
    snowballs[id] = mesh;
    
    // 雪玉の移動アニメーション
    animateSnowball(mesh, data);
    
    return mesh;
}

// 雪玉のアニメーション
function animateSnowball(mesh, data) {
    const startTime = Date.now();
    const duration = 2000;
    const startPos = new THREE.Vector3(data.x, data.y, data.z);
    const endPos = new THREE.Vector3(data.targetX, data.targetY, data.targetZ);
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (progress < 1) {
            mesh.position.lerpVectors(startPos, endPos, progress);
            mesh.position.y += Math.sin(progress * Math.PI) * 3;
            requestAnimationFrame(animate);
        } else {
            scene.remove(mesh);
            for (const id in snowballs) {
                if (snowballs[id] === mesh) {
                    delete snowballs[id];
                    break;
                }
            }
        }
    }
    
    animate();
}

// ！マークの表示
function showExclamationMark() {
    const exclamationElement = document.getElementById('exclamation-mark');
    if (exclamationElement) {
        exclamationElement.style.display = 'block';
    } else {
        const exclamation = document.createElement('div');
        exclamation.id = 'exclamation-mark';
        exclamation.innerHTML = '❗';
        exclamation.style.cssText = `
            position: fixed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px;
            color: #ff0000;
            z-index: 2000;
            cursor: pointer;
            animation: pulse 0.5s infinite alternate;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        `;
        
        exclamation.addEventListener('click', () => {
            if (showExclamation && myId !== oniId) {
                ws.send(JSON.stringify({ 
                    type: 'become_oni',
                    playerId: myId
                }));
            }
        });
        
        exclamation.addEventListener('touchstart', (event) => {
            event.preventDefault();
            if (showExclamation && myId !== oniId) {
                ws.send(JSON.stringify({ 
                    type: 'become_oni',
                    playerId: myId
                }));
            }
        });
        
        document.body.appendChild(exclamation);
    }
}

// ！マークの非表示
function hideExclamationMark() {
    const exclamationElement = document.getElementById('exclamation-mark');
    if (exclamationElement) {
        exclamationElement.style.display = 'none';
    }
}

// 設定UIの作成
function createSettingsUI() {
    // 設定ボタン
    const settingsButton = document.createElement('div');
    settingsButton.id = 'settings-button';
    settingsButton.innerHTML = '⚙️ Settings';
    settingsButton.style.cssText = `
        position: fixed;
        top: 20px;
        right: 180px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        border: 2px solid #ffffff;
        cursor: pointer;
        font-family: Arial, sans-serif;
        font-size: 14px;
        z-index: 1001;
        user-select: none;
        transition: background-color 0.3s;
    `;
    
    // 設定メニュー
    const settingsMenu = document.createElement('div');
    settingsMenu.id = 'settings-menu';
    settingsMenu.style.cssText = `
        position: fixed;
        top: 60px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        border: 2px solid #ffffff;
        font-family: Arial, sans-serif;
        z-index: 1002;
        display: none;
        min-width: 200px;
    `;
    
    settingsMenu.innerHTML = `
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px;">⚙️ 設定</div>
        <div id="tablet-toggle" style="
            background: rgba(255, 255, 255, 0.1);
            padding: 10px;
            border-radius: 5px;
            cursor: pointer;
            border: 1px solid #ccc;
            text-align: center;
            transition: background-color 0.3s;
            margin-bottom: 10px;
        ">📱 Tablet Mode</div>
        <div style="margin-bottom: 15px;">
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">🔐 Code入力</div>
            <input type="text" id="code-input" placeholder="Codeを入力..." style="
                width: 100%;
                padding: 8px;
                border-radius: 4px;
                border: 1px solid #ccc;
                background: rgba(255, 255, 255, 0.9);
                color: black;
                font-size: 14px;
            ">
            <button id="code-submit" style="
                width: 100%;
                padding: 8px;
                margin-top: 5px;
                border-radius: 4px;
                border: none;
                background: #007bff;
                color: white;
                cursor: pointer;
                font-size: 14px;
            ">確認</button>
        </div>
        <div style="font-size: 12px; opacity: 0.7;">
            タブレットモードでタッチ操作を有効にします
        </div>
    `;
    
    // ジョイスティック
    const joystickContainer = document.createElement('div');
    joystickContainer.id = 'joystick-container';
    joystickContainer.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 50px;
        width: 120px;
        height: 120px;
        background: rgba(255, 255, 255, 0.2);
        border: 3px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        display: none;
        z-index: 1003;
        touch-action: none;
    `;
    
    const joystickKnob = document.createElement('div');
    joystickKnob.id = 'joystick-knob';
    joystickKnob.style.cssText = `
        position: absolute;
        width: 40px;
        height: 40px;
        background: rgba(255, 255, 255, 0.8);
        border: 2px solid #ffffff;
        border-radius: 50%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        cursor: pointer;
        touch-action: none;
    `;
    
    joystickContainer.appendChild(joystickKnob);
    
    // ジャンプボタン
    const jumpButton = document.createElement('div');
    jumpButton.id = 'jump-button';
    jumpButton.innerHTML = 'JUMP';
    jumpButton.style.cssText = `
        position: fixed;
        bottom: 60px;
        right: 40px;
        width: 120px;
        height: 120px;
        background: rgba(0, 255, 0, 0.4);
        border: 4px solid rgba(0, 255, 0, 0.8);
        border-radius: 50%;
        display: none;
        justify-content: center;
        align-items: center;
        color: white;
        font-weight: bold;
        font-size: 18px;
        z-index: 1003;
        cursor: pointer;
        touch-action: none;
        user-select: none;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    
    document.body.appendChild(settingsButton);
    document.body.appendChild(settingsMenu);
    document.body.appendChild(joystickContainer);
    document.body.appendChild(jumpButton);
    
    // イベントリスナー
    settingsButton.addEventListener('click', () => {
        const menu = document.getElementById('settings-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    
    // 外側クリックで設定メニューを閉じる
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('settings-menu');
        const button = document.getElementById('settings-button');
        if (!menu.contains(event.target) && !button.contains(event.target)) {
            menu.style.display = 'none';
        }
    });
    
    // タブレットモード切り替え
    document.getElementById('tablet-toggle').addEventListener('click', () => {
        isTabletMode = !isTabletMode;
        const toggle = document.getElementById('tablet-toggle');
        const joystick = document.getElementById('joystick-container');
        const jump = document.getElementById('jump-button');
        
        if (isTabletMode) {
            toggle.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
            toggle.innerHTML = '📱 Tablet Mode (ON)';
            joystick.style.display = 'block';
            jump.style.display = 'flex';
        } else {
            toggle.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            toggle.innerHTML = '📱 Tablet Mode';
            joystick.style.display = 'none';
            jump.style.display = 'none';
        }
        
        // 設定メニューを閉じる
        document.getElementById('settings-menu').style.display = 'none';
    });
    
    // コード確認機能
    document.getElementById('code-submit').addEventListener('click', () => {
        const codeInput = document.getElementById('code-input');
        const code = codeInput.value.trim();
        
        if (code === 'trei0516') {
            playerRank = 'OWNER';
            isFlying = false; // 初期は飛行オフ
            showMessage('OWNERランクが付与されました！Fキーで飛行ON/OFF', 'success', 3000);
            
            // 自分にランク表示を追加
            if (myId && camera) {
                addRankDisplay(camera, 'OWNER');
            }
            
            // サーバーにランク情報を送信
            ws.send(JSON.stringify({
                type: 'set_rank',
                playerId: myId,
                rank: 'OWNER'
            }));
            
            codeInput.value = '';
            document.getElementById('settings-menu').style.display = 'none';
        } else if (code !== '') {
            showMessage('無効なコードです', 'error', 2000);
            codeInput.value = '';
        }
    });
    
    // Enterキーでコード確認
    document.getElementById('code-input').addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            document.getElementById('code-submit').click();
        }
    });
    
    // ジョイスティック操作
    setupJoystickControls();
}

// ジョイスティック操作の設定
function setupJoystickControls() {
    const container = document.getElementById('joystick-container');
    const knob = document.getElementById('joystick-knob');
    const jumpButton = document.getElementById('jump-button');
    
    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    
    function getEventPos(event) {
        if (event.touches && event.touches.length > 0) {
            return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }
        return { x: event.clientX, y: event.clientY };
    }
    
    function startDrag(event) {
        isDragging = true;
        joystickActive = true;
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        startPos = { x: centerX, y: centerY };
        
        event.preventDefault();
    }
    
    function drag(event) {
        if (!isDragging) return;
        
        const pos = getEventPos(event);
        const deltaX = pos.x - startPos.x;
        const deltaY = pos.y - startPos.y;
        
        const maxDistance = 40;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (distance <= maxDistance) {
            joystickPosition.x = -deltaX / maxDistance; // X軸反転
            joystickPosition.y = -deltaY / maxDistance; // Y軸反転
            knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        } else {
            const angle = Math.atan2(deltaY, deltaX);
            const clampedX = Math.cos(angle) * maxDistance;
            const clampedY = Math.sin(angle) * maxDistance;
            
            joystickPosition.x = -clampedX / maxDistance; // X軸反転
            joystickPosition.y = -clampedY / maxDistance; // Y軸反転
            knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
        }
        
        event.preventDefault();
    }
    
    function endDrag() {
        isDragging = false;
        joystickActive = false;
        joystickPosition = { x: 0, y: 0 };
        knob.style.transform = 'translate(-50%, -50%)';
    }
    
    // マウスイベント
    knob.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    
    // タッチイベント
    knob.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', drag);
    document.addEventListener('touchend', endDrag);
    
    // ジャンプボタン
    function jump() {
        if (canJump) {
            velocity.y += 18; // ジャンプ力を増加
            canJump = false;
        }
    }
    
    jumpButton.addEventListener('mousedown', jump);
    jumpButton.addEventListener('touchstart', (event) => {
        event.preventDefault();
        jump();
    });
    
    // タブレットモード用の視点操作
    setupTouchLookControls();
}

// タッチによる視点操作の設定
function setupTouchLookControls() {
    let touchStartX = 0;
    let touchStartY = 0;
    let isLooking = false;
    
    function handleTouchStart(event) {
        if (!isTabletMode) return;
        
        // ジョイスティックとジャンプボタンの範囲外でのみ視点操作
        const touch = event.touches[0];
        const joystickContainer = document.getElementById('joystick-container');
        const jumpButton = document.getElementById('jump-button');
        
        // タッチがコントロール要素上でないかチェック
        const touchedElement = document.elementFromPoint(touch.clientX, touch.clientY);
        if (joystickContainer && joystickContainer.contains(touchedElement)) return;
        if (jumpButton && jumpButton.contains(touchedElement)) return;
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        isLooking = true;
        
        event.preventDefault();
    }
    
    function handleTouchMove(event) {
        if (!isTabletMode || !isLooking) return;
        
        const touch = event.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        // 視点の回転感度
        const sensitivity = 0.002;
        
        // 水平回転（Y軸周り）
        controls.getObject().rotation.y -= deltaX * sensitivity;
        
        // 垂直回転（カメラのX軸回り）
        camera.rotation.x -= deltaY * sensitivity;
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        
        event.preventDefault();
    }
    
    function handleTouchEnd(event) {
        if (!isTabletMode) return;
        isLooking = false;
        event.preventDefault();
    }
    
    // タッチイベントリスナーを追加
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });
}

// PointerLockControls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

controls.getObject().position.set(0, 1.7, 0);

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// マウスクリック・タッチで剣振りアクション
let swordSwinging = false;

document.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    } else if (myId === oniId && !swordSwinging) {
        // 鬼の場合は剣を振る
        swingSword();
    } else if (canThrowSnowball && myId !== oniId) {
        // 逃走者で雪玉投擲可能な場合
        throwSnowball();
    }
});

document.addEventListener('touchstart', (event) => {
    if (myId === oniId && !swordSwinging) {
        event.preventDefault();
        swingSword();
    }
});

// 剣振りアクション
function swingSword() {
    if (!camera.sword || swordSwinging) return;
    
    swordSwinging = true;
    const sword = camera.sword;
    const originalRotation = sword.rotation.clone();
    
    console.log('剣振りアクション開始！');
    
    // 剣振りアニメーション
    const swingDuration = 300; // 0.3秒
    const startTime = Date.now();
    
    function animateSwing() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / swingDuration, 1);
        
        if (progress < 1) {
            // 剣を振り下ろす
            const swingAngle = Math.sin(progress * Math.PI) * Math.PI / 3;
            sword.rotation.x = originalRotation.x - swingAngle;
            sword.rotation.z = originalRotation.z + swingAngle * 0.5;
            
            requestAnimationFrame(animateSwing);
        } else {
            // 元の位置に戻す
            sword.rotation.copy(originalRotation);
            swordSwinging = false;
            console.log('剣振りアクション完了');
            
            // 剣振り時の鬼交代チェック
            checkSwordHit();
        }
    }
    
    animateSwing();
}

// 剣での攻撃判定
function checkSwordHit() {
    if (myId !== oniId) return;
    
    for (const id in players) {
        if (id === myId) continue;
        const otherPlayer = players[id];
        const distance = controls.getObject().position.distanceTo(otherPlayer.position);
        
        if (distance < 4.0) { // 剣の攻撃範囲
            console.log(`剣攻撃ヒット！鬼交代: ${myId} → ${id}`);
            ws.send(JSON.stringify({ 
                type: 'tag_player',
                id: myId,
                taggedId: id 
            }));
            break;
        }
    }
}

// 雪玉投擲（分離）
function throwSnowball() {
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    const playerPos = controls.getObject().position;
    const targetPos = playerPos.clone().add(direction.multiplyScalar(20));
    
    ws.send(JSON.stringify({
        type: 'throw_snowball',
        playerId: myId,
        startX: playerPos.x,
        startY: playerPos.y,
        startZ: playerPos.z,
        targetX: targetPos.x,
        targetY: targetPos.y,
        targetZ: targetPos.z
    }));
    
    canThrowSnowball = false;
    gameState.redItemsCollected = 0;
    gameState.score += 100;
    updateUI();
}

// キーボードイベント（WASD修正版）
const keys = {};

document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    
    keys[event.code] = true;
    
    switch (event.code) {
        case 'KeyW':
            moveBackward = true; // W = 後退
            break;
        case 'KeyA':
            moveRight = true; // A = 右移動
            break;
        case 'KeyS':
            moveForward = true; // S = 前進
            break;
        case 'KeyD':
            moveLeft = true; // D = 左移動
            break;
        case 'Space':
            event.preventDefault();
            if (playerRank === 'OWNER' && isFlying) {
                // 飛行中はスペースで上昇
                velocity.y += 12;
            } else if (canJump) {
                velocity.y += 18; // 強化されたジャンプ力
                canJump = false;
            }
            break;
        case 'KeyF':
            // OWNER専用：Fキーで飛行切り替え
            if (playerRank === 'OWNER') {
                isFlying = !isFlying;
                showMessage(isFlying ? '飛行モードON' : '飛行モードOFF', 'success', 1500);
                if (!isFlying) {
                    velocity.y = 0; // 飛行終了時は落下
                }
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
    
    switch (event.code) {
        case 'KeyW':
            moveBackward = false;
            break;
        case 'KeyA':
            moveRight = false;
            break;
        case 'KeyS':
            moveForward = false;
            break;
        case 'KeyD':
            moveLeft = false;
            break;
    }
});

// プレイヤー位置送信の最適化
let lastSentPosition = new THREE.Vector3();
let lastSentTime = 0;
const POSITION_SEND_INTERVAL = 50;
const POSITION_THRESHOLD = 0.1;

function sendPositionUpdate() {
    if (!isConnected || !myId) return;
    
    const currentTime = performance.now();
    const currentPosition = controls.getObject().position;
    
    if (currentTime - lastSentTime > POSITION_SEND_INTERVAL && 
        currentPosition.distanceTo(lastSentPosition) > POSITION_THRESHOLD) {
        
        ws.send(JSON.stringify({
            type: 'move',
            id: myId,
            x: currentPosition.x,
            y: currentPosition.y,
            z: currentPosition.z
        }));
        
        lastSentPosition.copy(currentPosition);
        lastSentTime = currentTime;
    }
}

// UIの更新
function updateUI() {
    const currentTime = Date.now();
    const gameTime = Math.floor((currentTime - gameState.gameStartTime) / 1000);
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    
    document.getElementById('player-id').textContent = myId;
    document.getElementById('role').textContent = myId === oniId ? '👹 鬼' : '🏃 逃走者';
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('game-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // 赤いアイテム数の更新
    const redItemsElement = document.getElementById('red-items');
    const redItemsCountElement = document.getElementById('red-items-count');
    const snowballStatusElement = document.getElementById('snowball-status');
    
    if (redItemsElement) {
        redItemsElement.textContent = gameState.redItemsCollected;
    }
    
    if (redItemsCountElement) {
        redItemsCountElement.style.display = myId !== oniId ? 'block' : 'none';
    }
    
    if (snowballStatusElement) {
        snowballStatusElement.style.display = canThrowSnowball ? 'block' : 'none';
    }
    
    // OWNER専用コントロール表示の更新
    const ownerControlsElement = document.getElementById('owner-controls');
    if (ownerControlsElement) {
        ownerControlsElement.style.display = playerRank === 'OWNER' ? 'block' : 'none';
    }
    
    // 鬼時間の更新
    const oniTimeElement = document.getElementById('oni-time');
    if (myId === oniId) {
        oniTimeElement.style.display = 'block';
        let totalOniTime = gameState.timeAsOni;
        if (gameState.oniStartTime) {
            totalOniTime += currentTime - gameState.oniStartTime;
        }
        const oniSeconds = Math.floor(totalOniTime / 1000);
        const oniMins = Math.floor(oniSeconds / 60);
        const oniSecs = oniSeconds % 60;
        document.getElementById('oni-duration').textContent = 
            `${oniMins.toString().padStart(2, '0')}:${oniSecs.toString().padStart(2, '0')}`;
    } else {
        oniTimeElement.style.display = 'none';
    }
}

// ミニマップの更新
function updateMinimap() {
    const ctx = gameState.minimapCtx;
    const canvas = gameState.minimapCanvas;
    
    if (!ctx || !canvas) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#222222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    const scale = (canvas.width - 20) / 200;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // 自分の位置
    const myPos = controls.getObject().position;
    const myX = centerX + myPos.x * scale;
    const myZ = centerY + myPos.z * scale;
    
    ctx.fillStyle = myId === oniId ? '#0000ff' : '#00ff00';
    ctx.beginPath();
    ctx.arc(myX, myZ, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // 他のプレイヤーの位置
    for (const id in players) {
        const player = players[id];
        const playerX = centerX + player.position.x * scale;
        const playerZ = centerY + player.position.z * scale;
        
        ctx.fillStyle = id === oniId ? '#ff0000' : '#88ff88';
        ctx.beginPath();
        ctx.arc(playerX, playerZ, 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 赤いアイテムの位置
    ctx.fillStyle = '#ff4444';
    for (const id in redItems) {
        const item = redItems[id];
        const itemX = centerX + item.position.x * scale;
        const itemZ = centerY + item.position.z * scale;
        
        ctx.beginPath();
        ctx.arc(itemX, itemZ, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 建物の表示
    ctx.fillStyle = '#8B4513';
    blocks.forEach(building => {
        if (!building.children) return;
        
        building.children.forEach(child => {
            if (!child.geometry || !child.geometry.parameters) return;
            
            const pos = building.position.clone().add(child.position);
            const buildingX = centerX + pos.x * scale;
            const buildingZ = centerY + pos.z * scale;
            const size = Math.max(2, child.geometry.parameters.width * scale / 2);
            ctx.fillRect(buildingX - size/2, buildingZ - size/2, size, size);
        });
    });
}

// 建物との衝突判定
function checkBuildingCollision(playerPos, playerRadius) {
    for (const building of blocks) {
        if (!building.children) continue;
        
        for (const child of building.children) {
            if (!child.geometry || !child.geometry.parameters) continue;
            
            const buildingPos = building.position.clone().add(child.position);
            const params = child.geometry.parameters;
            
            // AABB衝突判定
            const halfWidth = params.width / 2;
            const halfHeight = params.height / 2;
            const halfDepth = params.depth / 2;
            
            // プレイヤーが建物の高さ範囲内にいるかチェック
            if (playerPos.y + 1.7 > buildingPos.y && playerPos.y < buildingPos.y + params.height) {
                // X軸とZ軸での衝突判定
                if (Math.abs(playerPos.x - buildingPos.x) < halfWidth + playerRadius &&
                    Math.abs(playerPos.z - buildingPos.z) < halfDepth + playerRadius) {
                    
                    // 衝突した場合、押し戻す方向を計算
                    const deltaX = playerPos.x - buildingPos.x;
                    const deltaZ = playerPos.z - buildingPos.z;
                    
                    // より大きな軸で押し戻し
                    if (Math.abs(deltaX) > Math.abs(deltaZ)) {
                        // X軸方向に押し戻し
                        if (deltaX > 0) {
                            playerPos.x = buildingPos.x + halfWidth + playerRadius + 0.1;
                        } else {
                            playerPos.x = buildingPos.x - halfWidth - playerRadius - 0.1;
                        }
                        velocity.x = 0;
                    } else {
                        // Z軸方向に押し戻し
                        if (deltaZ > 0) {
                            playerPos.z = buildingPos.z + halfDepth + playerRadius + 0.1;
                        } else {
                            playerPos.z = buildingPos.z - halfDepth - playerRadius - 0.1;
                        }
                        velocity.z = 0;
                    }
                    
                    return true; // 衝突があった
                }
            }
        }
    }
    return false; // 衝突なし
}

// アニメーションループ
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 1/30);

    // 摩擦力の適用
    velocity.x *= Math.pow(0.1, delta);
    velocity.z *= Math.pow(0.1, delta);
    
    // 重力の適用（飛行時は無効）
    if (!isFlying) {
        velocity.y -= 9.8 * 15.0 * delta;
    }

    // 入力方向の計算（キーボード + ジョイスティック）
    let inputX = 0;
    let inputZ = 0;
    
    // キーボード入力
    if (moveForward || moveBackward) {
        inputZ = Number(moveForward) - Number(moveBackward);
    }
    if (moveLeft || moveRight) {
        inputX = Number(moveRight) - Number(moveLeft);
    }
    
    // ジョイスティック入力（タブレットモード時）
    if (isTabletMode && joystickActive) {
        inputX = joystickPosition.x;
        inputZ = joystickPosition.y;
    }
    
    // 入力の正規化
    const inputLength = Math.sqrt(inputX * inputX + inputZ * inputZ);
    if (inputLength > 0) {
        inputX /= inputLength;
        inputZ /= inputLength;
    }

    // 移動速度の適用（0.7倍に減速）
    const moveSpeed = 56.0; // 80.0 * 0.7 = 56.0 (0.7倍に減速)
    velocity.z -= inputZ * moveSpeed * delta;
    velocity.x -= inputX * moveSpeed * delta;
    
    // 位置の更新
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);
    controls.getObject().position.y += velocity.y * delta;
    
    // 壁との衝突判定（強化版 - 通過不可）
    const playerRadius = 1.0;
    const playerPos = controls.getObject().position;
    
    // 外周の壁との厳格な衝突判定
    const boundary = WALL_SIZE / 2 - 1;
    let hitWall = false;
    
    if (playerPos.x - playerRadius < -boundary) {
        playerPos.x = -boundary + playerRadius;
        velocity.x = 0;
        hitWall = true;
    }
    if (playerPos.x + playerRadius > boundary) {
        playerPos.x = boundary - playerRadius;
        velocity.x = 0;
        hitWall = true;
    }
    if (playerPos.z - playerRadius < -boundary) {
        playerPos.z = -boundary + playerRadius;
        velocity.z = 0;
        hitWall = true;
    }
    if (playerPos.z + playerRadius > boundary) {
        playerPos.z = boundary - playerRadius;
        velocity.z = 0;
        hitWall = true;
    }
    
    // 建物との衝突判定
    checkBuildingCollision(playerPos, playerRadius);
    
    // 地面との衝突判定（飛行時は無効）
    if (!isFlying) {
        if (controls.getObject().position.y < 1.7) {
            velocity.y = 0;
            controls.getObject().position.y = 1.7;
            canJump = true;
        }
    } else {
        // 飛行中は重力無効、摩擦でY軸も減速
        velocity.y *= Math.pow(0.3, delta);
        canJump = false;
    }

    // 赤いアイテムとの衝突判定
    for (const id in redItems) {
        const item = redItems[id];
        const distance = controls.getObject().position.distanceTo(item.position);
        if (distance < 2.0) {
            console.log(`赤いアイテム ${id} に接触！距離: ${distance.toFixed(2)}`);
            ws.send(JSON.stringify({ type: 'collect_red_item', itemId: id }));
        }
    }

    // 赤いアイテムの回転アニメーション
    for (const id in redItems) {
        redItems[id].rotation.y += delta * 6; // 超高速回転
        redItems[id].rotation.x += delta * 4; 
        redItems[id].position.y = 2.0 + Math.sin(time * 0.01) * 1.0; // 大きな浮遊
        
        // さらに目立つように光らせる
        if (redItems[id].material) {
            redItems[id].material.emissive.setHex(0xff0000);
            redItems[id].material.emissiveIntensity = 0.5 + Math.sin(time * 0.01) * 0.5;
        }
    }

    // 位置情報の送信
    sendPositionUpdate();

    // UIとミニマップの更新
    updateUI();
    updateMinimap();

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

// ウィンドウリサイズ対応
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 鬼ごっこの判定（確実な鬼交代システム）
setInterval(() => {
    if (!isConnected) return;
    
    if (myId === oniId) {
        // 鬼の場合：自動的な近接判定（剣振り以外）
        for (const id in players) {
            if (id === myId) continue;
            const otherPlayer = players[id];
            const distance = controls.getObject().position.distanceTo(otherPlayer.position);
            
            if (distance < 2.5) { // 自動タッチ判定
                console.log(`自動近接タッチ検出！鬼交代: ${myId} → ${id}, 距離: ${distance.toFixed(2)}`);
                ws.send(JSON.stringify({ 
                    type: 'tag_player',
                    id: myId,
                    taggedId: id 
                }));
                break;
            } else if (distance < 4.0) {
                // ！マーク表示
                ws.send(JSON.stringify({ 
                    type: 'show_exclamation',
                    playerId: id
                }));
            }
        }
    } else {
        // 逃走者の場合：鬼との距離をチェック
        if (players[oniId]) {
            const distance = controls.getObject().position.distanceTo(players[oniId].position);
            
            if (distance < 4.0 && !showExclamation) {
                showExclamation = true;
                showExclamationMark();
            } else if (distance >= 4.0 && showExclamation) {
                showExclamation = false;
                hideExclamationMark();
            }
        }
    }
}, 200); // より頻繁にチェック

// メッセージ表示関数
function showMessage(text, type = 'info', duration = 3000) {
    let messageElement;
    
    if (type === 'error') {
        messageElement = document.getElementById('error-message');
    } else if (type === 'success') {
        messageElement = document.getElementById('success-message');
    }
    
    if (messageElement) {
        messageElement.textContent = text;
        messageElement.style.display = 'block';
        
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, duration);
    } else {
        console.log(text);
    }
}, delta);
        canJump = false;
    }, delta);
        canJump = false;
    }

    // 赤いアイテムとの衝突判定
    for (const id in redItems) {
        const item = redItems[id];
        const distance = controls.getObject().position.distanceTo(item.position);
        if (distance < 2.0) {
            console.log(`赤いアイテム ${id} に接触！距離: ${distance.toFixed(2)}`);
            ws.send(JSON.stringify({ type: 'collect_red_item', itemId: id }));
        }
    }

    // 赤いアイテムの回転アニメーション
    for (const id in redItems) {
        redItems[id].rotation.y += delta * 6; // 超高速回転
        redItems[id].rotation.x += delta * 4; 
        redItems[id].position.y = 2.0 + Math.sin(time * 0.01) * 1.0; // 大きな浮遊
        
        // さらに目立つように光らせる
        if (redItems[id].material) {
            redItems[id].material.emissive.setHex(0xff0000);
            redItems[id].material.emissiveIntensity = 0.5 + Math.sin(time * 0.01) * 0.5;
        }
    }

    // 位置情報の送信
    sendPositionUpdate();

    // UIとミニマップの更新
    updateUI();
    updateMinimap();

    renderer.render(scene, camera);
    prevTime = time;
}

animate();

// ウィンドウリサイズ対応
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 鬼ごっこの判定（確実な鬼交代システム）
setInterval(() => {
    if (!isConnected) return;
    
    if (myId === oniId) {
        // 鬼の場合：自動的な近接判定（剣振り以外）
        for (const id in players) {
            if (id === myId) continue;
            const otherPlayer = players[id];
            const distance = controls.getObject().position.distanceTo(otherPlayer.position);
            
            if (distance < 2.5) { // 自動タッチ判定
                console.log(`自動近接タッチ検出！鬼交代: ${myId} → ${id}, 距離: ${distance.toFixed(2)}`);
                ws.send(JSON.stringify({ 
                    type: 'tag_player',
                    id: myId,
                    taggedId: id 
                }));
                break;
            } else if (distance < 4.0) {
                // ！マーク表示
                ws.send(JSON.stringify({ 
                    type: 'show_exclamation',
                    playerId: id
                }));
            }
        }
    } else {
        // 逃走者の場合：鬼との距離をチェック
        if (players[oniId]) {
            const distance = controls.getObject().position.distanceTo(players[oniId].position);
            
            if (distance < 4.0 && !showExclamation) {
                showExclamation = true;
                showExclamationMark();
            } else if (distance >= 4.0 && showExclamation) {
                showExclamation = false;
                hideExclamationMark();
            }
        }
    }
}, 200); // より頻繁にチェック

// メッセージ表示関数
function showMessage(text, type = 'info', duration = 3000) {
    let messageElement;
    
    if (type === 'error') {
        messageElement = document.getElementById('error-message');
    } else if (type === 'success') {
        messageElement = document.getElementById('success-message');
    }
    
    if (messageElement) {
        messageElement.textContent = text;
        messageElement.style.display = 'block';
        
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, duration);
    } else {
        console.log(text);
    }
}