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
        const oniSeconds = Math.floor(totalOniTime / 1000);
        const oniMins = Math.floor(oniSeconds / 60);
        const oniSecs = oniSeconds % 60;
        document.getElementById('oni-duration').textContent = 
            `${oniMins.toString().padStart(2, '0')}:${oniSecs.toString().padStart(2, '0')}`;
    } else {
        oniTimeElement.style.display = 'none';
    }
}

// パワーアップ効果の処理を削除
// function processPowerUpEffects() { ... } - 削除

// ミニマップの更新（赤いアイテム対応）
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
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    const buildingSize = 40 * scale;
    ctx.strokeRect(
        centerX - buildingSize/2, 
        centerY - buildingSize/2, 
        buildingSize, 
        buildingSize
    );
}import * as THREE from 'three';
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

// パワーアップの種類
const POWER_UP_TYPES = {
    SPEED_BOOST: {
        name: 'スピードブースト',
        color: 0x00ff00,
        duration: 10000,
        effect: 'speed',
        multiplier: 1.5
    },
    INVISIBLE: {
        name: '透明化',
        color: 0x888888,
        duration: 8000,
        effect: 'invisible'
    },
    SHIELD: {
        name: 'シールド',
        color: 0x0088ff,
        duration: 15000,
        effect: 'shield'
    },
    JUMP_BOOST: {
        name: 'ジャンプブースト',
        color: 0xff8800,
        duration: 12000,
        effect: 'jump',
        multiplier: 1.8
    }
};

ws.onopen = () => {
    console.log('WebSocket接続が確立されました。');
    isConnected = true;
    ws.send(JSON.stringify({ type: 'get_id' }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.id;
        oniId = data.oniId;
        console.log(`割り当てられたID: ${myId}`);
        
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
        for (const id in data.redItems || {}) {
            createRedItemMesh(id, data.redItems[id]);
        }
        
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
            
            // 10個集めたら雪玉投擲可能
            if (gameState.redItemsCollected >= 10) {
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
    } else if (data.type === 'show_exclamation') {
        if (data.playerId === myId && myId !== oniId) {
            showExclamation = true;
            showExclamationMark();
        }
    } else if (data.type === 'hide_exclamation') {
        if (data.playerId === myId) {
            showExclamation = false;
            hideExclamationMark();
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

// 外周の壁と建物の作成
const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
});

const walls = [];

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

// 5階建ての建物を作成
const buildings = createBuildings();
    const buildings = [];
    
    // 建物の設定
    const BUILDING_WIDTH = 40;
    const BUILDING_DEPTH = 40;
    const FLOOR_HEIGHT = 15;
    const WALL_THICKNESS = 2;
    
    // 色のパレット
    const colors = [
        0xff6b6b, // 赤
        0x4ecdc4, // ターコイズ
        0x45b7d1, // 青
        0x96ceb4, // 緑
        0xfeca57, // 黄
        0xff9ff3, // ピンク
        0x54a0ff, // 青2
        0x5f27cd  // 紫
    ];
    
    // 各階の建物を作成
    for (let floor = 0; floor < 5; floor++) {
        const y = FLOOR_HEIGHT * floor;
        const floorGroup = new THREE.Group();
        
        // 床の作成
        if (floor > 0) { // 1階以上に床を作成（地面は既にある）
            const floorGeometry = new THREE.BoxGeometry(BUILDING_WIDTH, 1, BUILDING_DEPTH);
            const floorMaterial = new THREE.MeshStandardMaterial({ 
                color: colors[floor % colors.length],
                opacity: 0.8,
                transparent: true
            });
            const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
            floorMesh.position.set(0, y - 1, 0);
            floorMesh.receiveShadow = true;
            floorMesh.castShadow = true;
            floorGroup.add(floorMesh);
        }
        
        // 外壁の作成（中央は空洞）
        const wallHeight = FLOOR_HEIGHT - 1;
        const wallColor = colors[(floor + 2) % colors.length];
        
        // 北側の壁（複数のセグメントに分割して出入り口を作成）
        for (let i = 0; i < 3; i++) {
            if (i === 1 && floor === 0) continue; // 1階の中央は入口として空ける
            
            const wallGeometry = new THREE.BoxGeometry(
                BUILDING_WIDTH / 3, 
                wallHeight, 
                WALL_THICKNESS
            );
            const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
                (i - 1) * (BUILDING_WIDTH / 3), 
                y + wallHeight / 2, 
                -BUILDING_DEPTH / 2
            );
            wall.receiveShadow = true;
            wall.castShadow = true;
            floorGroup.add(wall);
        }
        
        // 南側の壁
        for (let i = 0; i < 3; i++) {
            if (i === 1 && floor === 0) continue; // 1階の中央は入口として空ける
            
            const wallGeometry = new THREE.BoxGeometry(
                BUILDING_WIDTH / 3, 
                wallHeight, 
                WALL_THICKNESS
            );
            const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
                (i - 1) * (BUILDING_WIDTH / 3), 
                y + wallHeight / 2, 
                BUILDING_DEPTH / 2
            );
            wall.receiveShadow = true;
            wall.castShadow = true;
            floorGroup.add(wall);
        }
        
        // 東側の壁
        for (let i = 0; i < 3; i++) {
            if (i === 1 && floor === 0) continue; // 1階の中央は入口として空ける
            
            const wallGeometry = new THREE.BoxGeometry(
                WALL_THICKNESS, 
                wallHeight, 
                BUILDING_DEPTH / 3
            );
            const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
                BUILDING_WIDTH / 2, 
                y + wallHeight / 2, 
                (i - 1) * (BUILDING_DEPTH / 3)
            );
            wall.receiveShadow = true;
            wall.castShadow = true;
            floorGroup.add(wall);
        }
        
        // 西側の壁
        for (let i = 0; i < 3; i++) {
            if (i === 1 && floor === 0) continue; // 1階の中央は入口として空ける
            
            const wallGeometry = new THREE.BoxGeometry(
                WALL_THICKNESS, 
                wallHeight, 
                BUILDING_DEPTH / 3
            );
            const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
                -BUILDING_WIDTH / 2, 
                y + wallHeight / 2, 
                (i - 1) * (BUILDING_DEPTH / 3)
            );
            wall.receiveShadow = true;
            wall.castShadow = true;
            floorGroup.add(wall);
        }
        
        // 階段の作成（各階に上る階段）
        if (floor < 4) { // 最上階には階段不要
            const stairWidth = 8;
            const stairDepth = 3;
            const stairSteps = 10;
            const stepHeight = FLOOR_HEIGHT / stairSteps;
            
            for (let step = 0; step < stairSteps; step++) {
                const stepGeometry = new THREE.BoxGeometry(stairWidth, stepHeight, stairDepth);
                const stepMaterial = new THREE.MeshStandardMaterial({ 
                    color: colors[(floor + 4) % colors.length] 
                });
                const stepMesh = new THREE.Mesh(stepGeometry, stepMaterial);
                stepMesh.position.set(
                    BUILDING_WIDTH / 2 - 5, // 建物の端に配置
                    y + (step + 0.5) * stepHeight,
                    BUILDING_DEPTH / 2 - 5 - step * (stairDepth / 2)
                );
                stepMesh.receiveShadow = true;
                stepMesh.castShadow = true;
                floorGroup.add(stepMesh);
            }
        }
        
        scene.add(floorGroup);
        buildings.push(floorGroup);
    }
    
    console.log('5階建ての建物を作成しました');
    return buildings;
}

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
                赤いアイテム: <span id="red-items">${gameState.redItemsCollected}</span>/10
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
        <div id="effects-info" style="margin-top: 10px;">
            <!-- パワーアップ効果表示削除 -->
        </div>
        <div id="instructions" style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            <div>W: 後退 | S: 前進 | A: 右移動 | D: 左移動 | Space: ジャンプ</div>
            <div>マウス: 視点移動 | クリック: 雪玉投擲/鬼交代</div>
            <div>🔴赤いアイテム10個で雪玉投擲可能 🏢建物探索</div>
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
    
    swordGroup.position.set(1.2, -0.3, -1.5);
    swordGroup.rotation.x = -Math.PI / 6;
    
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

// 赤いアイテムメッシュの作成
function createRedItemMesh(id, data) {
    const geometry = new THREE.SphereGeometry(0.4, 12, 12);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        emissive: 0x440000,
        roughness: 0.2,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    mesh.castShadow = true;
    scene.add(mesh);
    redItems[id] = mesh;
    
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
    const duration = 2000; // 2秒で消える
    const startPos = new THREE.Vector3(data.x, data.y, data.z);
    const endPos = new THREE.Vector3(data.targetX, data.targetY, data.targetZ);
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (progress < 1) {
            // 放物線の軌道
            mesh.position.lerpVectors(startPos, endPos, progress);
            mesh.position.y += Math.sin(progress * Math.PI) * 3; // 弧を描く
            
            requestAnimationFrame(animate);
        } else {
            // 雪玉を削除
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
        exclamationElement.style.animation = 'pulse 0.5s infinite alternate';
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
        
        // クリック/タッチで鬼交代
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

// マウスクリックで雪玉投擲
document.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    } else if (canThrowSnowball && myId !== oniId) {
        // 雪玉を投げる
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
        
        // 雪玉投擲後はリセット
        canThrowSnowball = false;
        gameState.redItemsCollected = 0;
        gameState.score += 100; // 投擲ボーナス
        updateUI();
    }
});

// 設定とジョイスティックの状態
let isTabletMode = false;
let joystickActive = false;
let joystickPosition = { x: 0, y: 0 };

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
        ">📱 Tablet Mode</div>
        <div style="margin-top: 10px; font-size: 12px; opacity: 0.7;">
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
        bottom: 80px;
        right: 50px;
        width: 80px;
        height: 80px;
        background: rgba(0, 255, 0, 0.3);
        border: 3px solid rgba(0, 255, 0, 0.7);
        border-radius: 50%;
        display: none;
        justify-content: center;
        align-items: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        z-index: 1003;
        cursor: pointer;
        touch-action: none;
        user-select: none;
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
        if (canJump) {
            velocity.y += 12;
            canJump = false;
        }
    }
    
    jumpButton.addEventListener('mousedown', jump);
    jumpButton.addEventListener('touchstart', (event) => {
        event.preventDefault();
        jump();
    });
}

// キーボードイベント（WSキーの修正）
const keys = {};

document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    
    keys[event.code] = true;
    
    switch (event.code) {
        case 'KeyW':
            moveBackward = true; // W = 後退
            break;
        case 'KeyA':
            moveRight = true; // A = 右移動（修正）
            break;
        case 'KeyS':
            moveForward = true; // S = 前進
            break;
        case 'KeyD':
            moveLeft = true; // D = 左移動（修正）
            break;
        case 'Space':
            event.preventDefault();
            if (canJump) {
                const jumpMultiplier = gameState.playerEffects.has('JUMP_BOOST') ? 
                    POWER_UP_TYPES.JUMP_BOOST.multiplier : 1;
                velocity.y += 12 * jumpMultiplier;
                canJump = false;
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    keys[event.code] = false;
    
    switch (event.code) {
        case 'KeyW':
            moveBackward = false; // W = 後退
            break;
        case 'KeyA':
            moveRight = false; // A = 右移動（修正）
            break;
        case 'KeyS':
            moveForward = false; // S = 前進
            break;
        case 'KeyD':
            moveLeft = false; // D = 左移動（修正）
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

// パワーアップ効果の処理
function processPowerUpEffects() {
    const currentTime = Date.now();
    
    for (const [type, effect] of gameState.playerEffects) {
        if (currentTime > effect.endTime) {
            gameState.playerEffects.delete(type);
            console.log(`パワーアップ効果終了: ${effect.name}`);
        }
    }
}

// 透明化効果の適用
function applyInvisibilityEffect() {
    if (gameState.playerEffects.has('INVISIBLE')) {
        // 自分を半透明にする（見た目の変化）
        // 実装は省略（必要に応じて）
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
    
    // オーブの位置
    ctx.fillStyle = '#ff4444';
    for (const id in orbs) {
        const orb = orbs[id];
        const orbX = centerX + orb.position.x * scale;
        const orbZ = centerY + orb.position.z * scale;
        
        ctx.beginPath();
        ctx.arc(orbX, orbZ, 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // パワーアップの位置
    ctx.fillStyle = '#ffff00';
    for (const id in powerUps) {
        const powerUp = powerUps[id];
        const puX = centerX + powerUp.position.x * scale;
        const puZ = centerY + powerUp.position.z * scale;
        
        ctx.beginPath();
        ctx.arc(puX, puZ, 3, 0, Math.PI * 2);
        ctx.fill();
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
    
    // アクティブ効果の表示
    const effectsElement = document.getElementById('active-effects');
    effectsElement.innerHTML = '';
    
    for (const [type, effect] of gameState.playerEffects) {
        const timeLeft = Math.max(0, effect.endTime - currentTime);
        if (timeLeft > 0) {
            const div = document.createElement('div');
            div.style.cssText = `
                color: #${effect.color.toString(16).padStart(6, '0')};
                font-size: 12px;
                margin: 2px 0;
            `;
            div.textContent = `${effect.name}: ${Math.ceil(timeLeft / 1000)}秒`;
            effectsElement.appendChild(div);
        }
    }
}

// アニメーションループ
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 1/30);

    // パワーアップ効果の処理
    // processPowerUpEffects(); // 削除

    // 移動速度の計算
    const speedMultiplier = 1; // パワーアップ削除により固定

    // 摩擦力の適用
    velocity.x *= Math.pow(0.1, delta);
    velocity.z *= Math.pow(0.1, delta);
    
    // 重力の適用
    velocity.y -= 9.8 * 15.0 * delta;

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
        inputZ = -joystickPosition.y; // Y軸を反転
    }
    
    // 入力の正規化
    const inputLength = Math.sqrt(inputX * inputX + inputZ * inputZ);
    if (inputLength > 0) {
        inputX /= inputLength;
        inputZ /= inputLength;
    }

    // 移動速度の適用（大幅に減速）
    const moveSpeed = 80.0 * speedMultiplier; // 300.0から80.0に減速
    velocity.z -= inputZ * moveSpeed * delta;
    velocity.x -= inputX * moveSpeed * delta;
    
    // 位置の更新
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);
    controls.getObject().position.y += velocity.y * delta;
    
    // 壁との衝突判定
    const playerRadius = 1.0;
    const playerPos = controls.getObject().position;
    
    if (playerPos.x - playerRadius < -WALL_SIZE/2 + 1) {
        playerPos.x = -WALL_SIZE/2 + 1 + playerRadius;
        velocity.x = 0;
    }
    if (playerPos.x + playerRadius > WALL_SIZE/2 - 1) {
        playerPos.x = WALL_SIZE/2 - 1 - playerRadius;
        velocity.x = 0;
    }
    if (playerPos.z - playerRadius < -WALL_SIZE/2 + 1) {
        playerPos.z = -WALL_SIZE/2 + 1 + playerRadius;
        velocity.z = 0;
    }
    if (playerPos.z + playerRadius > WALL_SIZE/2 - 1) {
        playerPos.z = WALL_SIZE/2 - 1 - playerRadius;
        velocity.z = 0;
    }
    
    // 地面との衝突判定
    if (controls.getObject().position.y < 1.7) {
        velocity.y = 0;
        controls.getObject().position.y = 1.7;
        canJump = true;
    }

    // 赤いアイテムとの衝突判定
    for (const id in redItems) {
        const item = redItems[id];
        const distance = controls.getObject().position.distanceTo(item.position);
        if (distance < 1.0) {
            ws.send(JSON.stringify({ type: 'collect_red_item', itemId: id }));
        }
    }

    // 赤いアイテムの回転アニメーション
    for (const id in redItems) {
        redItems[id].rotation.y += delta * 3;
        redItems[id].position.y = 0.5 + Math.sin(time * 0.004 + parseFloat(id.slice(8)) * 0.5) * 0.2;
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

// 鬼ごっこの判定（！マーク表示機能付き）
setInterval(() => {
    if (!isConnected) return;
    
    if (myId === oniId) {
        // 鬼の場合：他のプレイヤーとの距離をチェック
        for (const id in players) {
            if (id === myId) continue;
            const otherPlayer = players[id];
            const distance = controls.getObject().position.distanceTo(otherPlayer.position);
            
            if (distance < 2.5) {
                // 距離が近い場合、相手に！マークを表示
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
            
            if (distance < 2.5 && !showExclamation) {
                // 鬼が近づいた場合、自分に！マークを表示
                showExclamation = true;
                showExclamationMark();
            } else if (distance >= 2.5 && showExclamation) {
                // 鬼が離れた場合、！マークを非表示
                showExclamation = false;
                hideExclamationMark();
            }
        }
    }
}, 300);

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
        console.log(text); // フォールバック
    }
}