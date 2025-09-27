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

// OWNER特権とフライトシステム
let playerRank = null; // プレイヤーのランク
let isFlying = false; // フライト状態
let flightEnabled = false; // フライトが有効か

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

// 外周の壁と障害物の作成
const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const WALL_THICKNESS = 4; // 壁の厚さを4ユニットに増加（貫通防止）

const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
});

const walls = [];
const blocks = []; // ブロック衝突判定用（壁も含む）

// 外周の壁（厚くして貫通を防ぐ）
const wall1 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
wall1.position.set(0, (WALL_HEIGHT / 2) - 1, -WALL_SIZE / 2);
wall1.receiveShadow = true;
wall1.castShadow = true;
scene.add(wall1);
walls.push(wall1);
blocks.push(wall1); // 衝突判定に追加

const wall2 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
wall2.position.set(0, (WALL_HEIGHT / 2) - 1, WALL_SIZE / 2);
wall2.receiveShadow = true;
wall2.castShadow = true;
scene.add(wall2);
walls.push(wall2);
blocks.push(wall2); // 衝突判定に追加

const wall3 = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall3.position.set(-WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall3.receiveShadow = true;
wall3.castShadow = true;
scene.add(wall3);
walls.push(wall3);
blocks.push(wall3); // 衝突判定に追加

const wall4 = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall4.position.set(WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall4.receiveShadow = true;
wall4.castShadow = true;
scene.add(wall4);
walls.push(wall4);
blocks.push(wall4); // 衝突判定に追加

// 改良された建物配置システム
function createStructuredBuildings() {
    // 建物の基本設定
    const buildingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B4513,
        roughness: 0.3,
        metalness: 0.1
    });
    
    const specialMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xFECE57,
        roughness: 0.3,
        metalness: 0.1
    });

    // 中央広場の建物群
    const centralBuildings = [
        { pos: [0, 4, 0], size: [12, 8, 12], type: 'central_tower' },
        { pos: [20, 3, 20], size: [8, 6, 8], type: 'corner_building' },
        { pos: [-20, 3, 20], size: [8, 6, 8], type: 'corner_building' },
        { pos: [20, 3, -20], size: [8, 6, 8], type: 'corner_building' },
        { pos: [-20, 3, -20], size: [8, 6, 8], type: 'corner_building' },
    ];

    // 外周エリアの建物
    const outerBuildings = [
        // 北側エリア
        { pos: [0, 3, 60], size: [15, 6, 10], type: 'long_building' },
        { pos: [30, 3, 70], size: [10, 8, 10], type: 'tower' },
        { pos: [-30, 3, 70], size: [10, 8, 10], type: 'tower' },
        
        // 南側エリア
        { pos: [0, 3, -60], size: [15, 6, 10], type: 'long_building' },
        { pos: [40, 3, -65], size: [8, 10, 8], type: 'tall_tower' },
        { pos: [-40, 3, -65], size: [8, 10, 8], type: 'tall_tower' },
        
        // 東側エリア
        { pos: [70, 3, 0], size: [10, 6, 20], type: 'wall_building' },
        { pos: [60, 3, 30], size: [12, 5, 8], type: 'platform' },
        { pos: [60, 3, -30], size: [12, 5, 8], type: 'platform' },
        
        // 西側エリア
        { pos: [-70, 3, 0], size: [10, 6, 20], type: 'wall_building' },
        { pos: [-60, 3, 30], size: [12, 5, 8], type: 'platform' },
        { pos: [-60, 3, -30], size: [12, 5, 8], type: 'platform' },
    ];

    // 迷路風の小さな建物群
    const mazeBuildings = [
        // 北東エリア
        { pos: [45, 2, 45], size: [6, 4, 6], type: 'small_block' },
        { pos: [55, 2, 35], size: [6, 4, 6], type: 'small_block' },
        { pos: [35, 2, 55], size: [6, 4, 6], type: 'small_block' },
        
        // 北西エリア
        { pos: [-45, 2, 45], size: [6, 4, 6], type: 'small_block' },
        { pos: [-55, 2, 35], size: [6, 4, 6], type: 'small_block' },
        { pos: [-35, 2, 55], size: [6, 4, 6], type: 'small_block' },
        
        // 南東エリア
        { pos: [45, 2, -45], size: [6, 4, 6], type: 'small_block' },
        { pos: [55, 2, -35], size: [6, 4, 6], type: 'small_block' },
        { pos: [35, 2, -55], size: [6, 4, 6], type: 'small_block' },
        
        // 南西エリア
        { pos: [-45, 2, -45], size: [6, 4, 6], type: 'small_block' },
        { pos: [-55, 2, -35], size: [6, 4, 6], type: 'small_block' },
        { pos: [-35, 2, -55], size: [6, 4, 6], type: 'small_block' },
    ];

    // 特殊建物（黄色い目標建物）
    const specialBuildings = [
        { pos: [0, 6, 40], size: [8, 12, 8], type: 'special_tower', material: specialMaterial },
        { pos: [0, 6, -40], size: [8, 12, 8], type: 'special_tower', material: specialMaterial },
    ];

    // 全建物を作成
    const allBuildings = [
        ...centralBuildings,
        ...outerBuildings,
        ...mazeBuildings,
        ...specialBuildings
    ];

    allBuildings.forEach((building, index) => {
        const material = building.material || buildingMaterial;
        const geometry = new THREE.BoxGeometry(...building.size);
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(...building.pos);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.buildingType = building.type;
        mesh.userData.buildingId = `building_${index}`;
        
        scene.add(mesh);
        blocks.push(mesh);
    });

    // 橋や通路の追加
    createBridgesAndPlatforms();
    
    console.log(`構造化された建物を作成しました: ${allBuildings.length}個の建物`);
}

// 橋や通路の作成
function createBridgesAndPlatforms() {
    const bridgeMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x654321,
        roughness: 0.6,
        metalness: 0.2
    });

    // 空中橋
    const bridges = [
        { pos: [0, 8, 0], size: [30, 1, 4], rotation: [0, 0, 0] },
        { pos: [0, 8, 0], size: [4, 1, 30], rotation: [0, Math.PI/2, 0] },
        { pos: [40, 6, 0], size: [20, 1, 3], rotation: [0, Math.PI/2, 0] },
        { pos: [-40, 6, 0], size: [20, 1, 3], rotation: [0, Math.PI/2, 0] },
    ];

    bridges.forEach((bridge, index) => {
        const geometry = new THREE.BoxGeometry(...bridge.size);
        const mesh = new THREE.Mesh(geometry, bridgeMaterial);
        
        mesh.position.set(...bridge.pos);
        mesh.rotation.set(...bridge.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.buildingType = 'bridge';
        mesh.userData.buildingId = `bridge_${index}`;
        
        scene.add(mesh);
        blocks.push(mesh);
    });

    // 階段やスロープ
    const ramps = [
        { pos: [15, 2, 15], size: [8, 2, 8], rotation: [0, 0, 0] },
        { pos: [-15, 2, 15], size: [8, 2, 8], rotation: [0, 0, 0] },
        { pos: [15, 2, -15], size: [8, 2, 8], rotation: [0, 0, 0] },
        { pos: [-15, 2, -15], size: [8, 2, 8], rotation: [0, 0, 0] },
    ];

    ramps.forEach((ramp, index) => {
        const geometry = new THREE.BoxGeometry(...ramp.size);
        const mesh = new THREE.Mesh(geometry, bridgeMaterial);
        
        mesh.position.set(...ramp.pos);
        mesh.rotation.set(...ramp.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.buildingType = 'ramp';
        mesh.userData.buildingId = `ramp_${index}`;
        
        scene.add(mesh);
        blocks.push(mesh);
    });
}

// 構造化された建物を作成
createStructuredBuildings();

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
            <div id="owner-status" style="display: none; color: #gold;">
                OWNER: <span id="flight-status">フライト無効</span>
            </div>
        </div>
        <div id="timer-info" style="margin-top: 10px;">
            <div>ゲーム時間: <span id="game-time">00:00</span></div>
            <div id="oni-time" style="display: ${myId === oniId ? 'block' : 'none'}">
                鬼時間: <span id="oni-duration">00:00</span>
            </div>
        </div>
        <div id="instructions" style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            <div>W: 前進 | S: 後退 | A: 左移動 | D: 右移動 | Space: ジャンプ</div>
            <div>マウス: 視点移動 | クリック: 雪玉投擲/鬼交代</div>
            <div id="owner-controls" style="display: none; color: #gold;">
                F: フライト切替 | Space: 上昇 | Shift: 下降
            </div>
            <div>🔴赤いアイテム8個で雪玉投擲可能 🧱建物探索</div>
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

// 剣を追加する関数
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
    swordGroup.position.set(1.0, -1.2, -0.5);
    swordGroup.rotation.x = Math.PI / 4;
    swordGroup.rotation.y = -Math.PI / 6;
    
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

// 赤いアイテムメッシュの作成
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
        const progress = Math.min(elapsed / 1000, 1);
        
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
        color: 0x8a2be2,
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

// 感嘆符マークの表示
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

// 感嘆符マークの非表示
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
            flightEnabled = true;
            showMessage('OWNERランクが付与されました！Fキーでフライト切替', 'success', 3000);
            
            // OWNER UIを表示
            const ownerStatus = document.getElementById('owner-status');
            const ownerControls = document.getElementById('owner-controls');
            if (ownerStatus) ownerStatus.style.display = 'block';
            if (ownerControls) ownerControls.style.display = 'block';
            
            // 自分にランク表示を追加
            addRankDisplay(camera, 'OWNER');
            
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
    
    if (!container || !knob || !jumpButton) return;
    
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
            joystickPosition.x = deltaX / maxDistance;
            joystickPosition.y = deltaY / maxDistance;
            knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        } else {
            const angle = Math.atan2(deltaY, deltaX);
            const clampedX = Math.cos(angle) * maxDistance;
            const clampedY = Math.sin(angle) * maxDistance;
            
            joystickPosition.x = clampedX / maxDistance;
            joystickPosition.y = clampedY / maxDistance;
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
        if (canJump || (flightEnabled && isFlying)) {
            velocity.y += 18;
            canJump = false;
        }
    }
    
    jumpButton.addEventListener('mousedown', jump);
    jumpButton.addEventListener('touchstart', (event) => {
        event.preventDefault();
        jump();
    });
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
    const swingDuration = 300;
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
        
        if (distance < 4.0) {
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

// 雪玉投擲
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

// キーボードイベント（WASD移動を正しく修正）
const keys = {};

document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    
    keys[event.code] = true;
    
    switch (event.code) {
        case 'KeyW':
            moveForward = true; // 前進
            break;
        case 'KeyA':
            moveLeft = true; // 左移動
            break;
        case 'KeyS':
            moveBackward = true; // 後退
            break;
        case 'KeyD':
            moveRight = true; // 右移動
            break;
        case 'Space':
            event.preventDefault();
            if (flightEnabled && isFlying) {
                // フライト中は上昇
                velocity.y += 15;
            } else if (canJump) {
                // 通常ジャンプ
                velocity.y += 18;
                canJump = false;
            }
            break;
        case 'ShiftLeft':
            event.preventDefault();
            if (flightEnabled && isFlying) {
                // フライト中は下降
                velocity.y -= 15;
            }
            break;
        case 'KeyF':
            event.preventDefault();
            if (flightEnabled && playerRank === 'OWNER') {
                // フライト切り替え
                isFlying = !isFlying;
                const flightStatus = document.getElementById('flight-status');
                if (flightStatus) {
                    flightStatus.textContent = isFlying ? 'フライト有効' : 'フライト無効';
                }
                showMessage(isFlying ? 'フライトモード有効！' : 'フライトモード無効', 'success', 2000);
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
    
    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyD':
            moveRight = false;
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
    
    if (document.getElementById('player-id')) {
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
        
        // 鬼時間の更新
        const oniTimeElement = document.getElementById('oni-time');
        if (myId === oniId) {
            oniTimeElement.style.display = 'block';
            let totalOniTime = gameState.timeAsOni;
            if (gameState.oniStartTime) {
                totalOniTime += currentTime - gameState.oniStartTime;
            }
            
            const oniMinutes = Math.floor(totalOniTime / 60000);
            const oniSeconds = Math.floor((totalOniTime % 60000) / 1000);
            document.getElementById('oni-duration').textContent = 
                `${oniMinutes.toString().padStart(2, '0')}:${oniSeconds.toString().padStart(2, '0')}`;
        } else {
            oniTimeElement.style.display = 'none';
        }
    }
    
    // ミニマップの更新
    updateMinimap();
}

// ミニマップの更新
function updateMinimap() {
    if (!gameState.minimapCtx) return;
    
    const ctx = gameState.minimapCtx;
    const canvas = gameState.minimapCanvas;
    
    // 背景をクリア
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // マップサイズとスケール
    const mapSize = 200;
    const scale = canvas.width / mapSize;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // プレイヤーの現在位置
    const playerPos = controls.getObject().position;
    
    // 建物を描画
    ctx.fillStyle = '#8B4513';
    blocks.forEach(block => {
        const x = centerX + (block.position.x - playerPos.x) * scale;
        const y = centerY + (block.position.z - playerPos.z) * scale;
        const size = 4;
        
        if (x > -size && x < canvas.width + size && y > -size && y < canvas.height + size) {
            ctx.fillRect(x - size/2, y - size/2, size, size);
        }
    });
    
    // 赤いアイテムを描画
    ctx.fillStyle = '#ff0000';
    for (const id in redItems) {
        const item = redItems[id];
        const x = centerX + (item.position.x - playerPos.x) * scale;
        const y = centerY + (item.position.z - playerPos.z) * scale;
        
        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    // 他のプレイヤーを描画
    for (const id in players) {
        const player = players[id];
        const x = centerX + (player.position.x - playerPos.x) * scale;
        const y = centerY + (player.position.z - playerPos.z) * scale;
        
        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.fillStyle = id === oniId ? '#0000ff' : '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
            
            // プレイヤー名を表示
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(id, x, y - 6);
        }
    }
    
    // 自分を描画（中央）
    ctx.fillStyle = myId === oniId ? '#0000ff' : '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fill();
    
    // 方向指示
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    ctx.lineTo(centerX + direction.x * 10, centerY + direction.z * 10);
    ctx.stroke();
}

// メッセージ表示関数
function showMessage(text, type = 'info', duration = 3000) {
    const messageContainer = document.getElementById('message-container') || createMessageContainer();
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        background: ${type === 'success' ? 'rgba(0, 255, 0, 0.8)' : 
                     type === 'error' ? 'rgba(255, 0, 0, 0.8)' : 
                     'rgba(0, 123, 255, 0.8)'};
        color: white;
        padding: 10px 15px;
        margin: 5px 0;
        border-radius: 5px;
        font-weight: bold;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    messageElement.textContent = text;
    
    messageContainer.appendChild(messageElement);
    
    setTimeout(() => {
        if (messageElement.parentNode) {
            messageElement.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (messageElement.parentNode) {
                    messageContainer.removeChild(messageElement);
                }
            }, 300);
        }
    }, duration);
}

function createMessageContainer() {
    const container = document.createElement('div');
    container.id = 'message-container';
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 3000;
        max-width: 400px;
        pointer-events: none;
    `;
    
    // アニメーション用のスタイルを追加
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-20px); }
        }
        @keyframes pulse {
            from { transform: scale(1); }
            to { transform: scale(1.1); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(container);
    return container;
}

// 衝突検出
function checkCollisions(targetPosition) {
    const playerRadius = 1.0;
    
    for (const block of blocks) {
        const blockBox = new THREE.Box3().setFromObject(block);
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            targetPosition,
            new THREE.Vector3(playerRadius * 2, 3.4, playerRadius * 2)
        );
        
        if (blockBox.intersectsBox(playerBox)) {
            return true;
        }
    }
    
    return false;
}

// 赤いアイテムの収集チェック
function checkRedItemCollection() {
    const playerPosition = controls.getObject().position;
    const collectionDistance = 2.0;
    
    for (const id in redItems) {
        const item = redItems[id];
        const distance = playerPosition.distanceTo(item.position);
        
        if (distance < collectionDistance) {
            ws.send(JSON.stringify({
                type: 'collect_red_item',
                playerId: myId,
                itemId: id
            }));
            break;
        }
    }
}

// ゲームループ（改良された移動システム）
function animate() {
    requestAnimationFrame(animate);
    
    if (!isConnected) {
        renderer.render(scene, camera);
        return;
    }
    
    // プレイヤー移動の処理（WASD修正版）
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    
    // ジョイスティック入力の処理
    if (joystickActive) {
        direction.x += joystickPosition.x;
        direction.z += joystickPosition.y;
        direction.normalize();
    }
    
    const speed = 12.0; // 移動速度を調整
    const currentPosition = controls.getObject().position.clone();
    
    // 前後移動
    if (moveForward || moveBackward || joystickActive) {
        const moveVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(moveVector);
        moveVector.y = 0;
        moveVector.normalize();
        moveVector.multiplyScalar(direction.z * speed);
        
        const newPosition = currentPosition.clone().add(moveVector);
        newPosition.y = currentPosition.y;
        
        if (!checkCollisions(newPosition)) {
            velocity.z -= direction.z * speed;
        }
    }
    
    // 左右移動
    if (moveLeft || moveRight || joystickActive) {
        const strafeVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(strafeVector);
        strafeVector.cross(controls.getObject().up);
        strafeVector.y = 0;
        strafeVector.normalize();
        strafeVector.multiplyScalar(direction.x * speed);
        
        const newPosition = currentPosition.clone().add(strafeVector);
        newPosition.y = currentPosition.y;
        
        if (!checkCollisions(newPosition)) {
            velocity.x -= direction.x * speed;
        }
    }
    
    // 重力とジャンプの処理
    if (!isFlying) {
        velocity.y -= 50.0; // 重力
        
        if (controls.getObject().position.y <= 1.7) {
            velocity.y = 0;
            controls.getObject().position.y = 1.7;
            canJump = true;
        }
    } else {
        // フライト中は重力無効
        velocity.y *= 0.9; // 減衰
    }
    
    // 最終的な位置更新
    const finalPosition = controls.getObject().position.clone();
    const deltaTime = 1/60;
    
    finalPosition.x += velocity.x * deltaTime;
    finalPosition.z += velocity.z * deltaTime;
    
    if (!checkCollisions(finalPosition)) {
        controls.getObject().position.copy(finalPosition);
    }
    
    controls.getObject().position.y += velocity.y * deltaTime;
    
    // 速度の減衰
    velocity.x *= 0.8;
    velocity.z *= 0.8;
    
    // マップ境界チェック
    const mapLimit = 98;
    if (controls.getObject().position.x < -mapLimit) controls.getObject().position.x = -mapLimit;
    if (controls.getObject().position.x > mapLimit) controls.getObject().position.x = mapLimit;
    if (controls.getObject().position.z < -mapLimit) controls.getObject().position.z = -mapLimit;
    if (controls.getObject().position.z > mapLimit) controls.getObject().position.z = mapLimit;
    
    // アイテム収集チェック
    checkRedItemCollection();
    
    // 位置送信
    sendPositionUpdate();
    
    // UI更新
    updateUI();
    
    // レンダリング
    renderer.render(scene, camera);
    
    // 赤いアイテムの回転アニメーション
    const time = Date.now() * 0.001;
    for (const id in redItems) {
        const item = redItems[id];
        item.rotation.y = time;
        item.position.y = item.userData.originalY || item.position.y + Math.sin(time * 2) * 0.3;
        if (!item.userData.originalY) {
            item.userData.originalY = item.position.y;
        }
    }
    
    // ランク表示をカメラの方向に向ける
    for (const id in players) {
        const player = players[id];
        if (player.rankDisplay) {
            player.rankDisplay.lookAt(camera.position);
        }
    }
}

// ウィンドウリサイズイベント
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ゲーム開始
animate();