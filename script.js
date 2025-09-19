import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// WebSocket接続
const ws = new WebSocket(`wss://${window.location.host}`);
let myId = null;
let players = {};
let orbs = {};
let powerUps = {};
let oniId = null;
let isConnected = false;

// ゲーム状態の管理
let gameState = {
    score: 0,
    timeAsOni: 0,
    timeAlive: 0,
    playerEffects: new Map(),
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
        for (const id in data.orbs) {
            createOrbMesh(id, data.orbs[id]);
        }
        for (const id in data.powerUps || {}) {
            createPowerUpMesh(id, data.powerUps[id]);
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
    } else if (data.type === 'orb_eaten') {
        if (orbs[data.orbId]) {
            scene.remove(orbs[data.orbId]);
            delete orbs[data.orbId];
        }
    } else if (data.type === 'powerup_collected') {
        if (powerUps[data.powerUpId]) {
            scene.remove(powerUps[data.powerUpId]);
            delete powerUps[data.powerUpId];
        }
        if (data.playerId === myId) {
            applyPowerUp(data.type);
        }
    } else if (data.type === 'powerup_spawned') {
        createPowerUpMesh(data.id, data.powerUp);
    } else if (data.type === 'orbs_respawned') {
        // 既存のオーブを削除
        for (const id in orbs) {
            scene.remove(orbs[id]);
        }
        orbs = {};
        
        // 新しいオーブを追加
        for (const id in data.orbs) {
            createOrbMesh(id, data.orbs[id]);
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

// 壁の設定
const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
});

const walls = [];

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
        </div>
        <div id="timer-info" style="margin-top: 10px;">
            <div>ゲーム時間: <span id="game-time">00:00</span></div>
            <div id="oni-time" style="display: ${myId === oniId ? 'block' : 'none'}">
                鬼時間: <span id="oni-duration">00:00</span>
            </div>
        </div>
        <div id="effects-info" style="margin-top: 10px;">
            <div id="active-effects"></div>
        </div>
        <div id="instructions" style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            <div>WS: 前後移動 | AD: 左右移動 | Space: ジャンプ</div>
            <div>マウス: 視点移動</div>
            <div>🟢オーブ 🟡パワーアップ</div>
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

// オーブメッシュ
function createOrbMesh(id, data) {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff4444,
        emissive: 0x440000,
        roughness: 0.1,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    mesh.castShadow = true;
    scene.add(mesh);
    orbs[id] = mesh;
    
    return mesh;
}

// パワーアップメッシュの作成
function createPowerUpMesh(id, data) {
    const group = new THREE.Group();
    
    const type = POWER_UP_TYPES[data.type] || POWER_UP_TYPES.SPEED_BOOST;
    
    // メインオーブ
    const geometry = new THREE.SphereGeometry(0.6, 16, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: type.color,
        emissive: new THREE.Color(type.color).multiplyScalar(0.3),
        transparent: true,
        opacity: 0.8
    });
    const orb = new THREE.Mesh(geometry, material);
    orb.castShadow = true;
    group.add(orb);
    
    // エフェクトリング
    const ringGeometry = new THREE.TorusGeometry(1, 0.1, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: type.color,
        emissive: new THREE.Color(type.color).multiplyScalar(0.5),
        transparent: true,
        opacity: 0.6
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    
    group.position.set(data.x, data.y, data.z);
    group.userData = { type: data.type, ring: ring };
    scene.add(group);
    powerUps[id] = group;
    
    return group;
}

// パワーアップ効果の適用
function applyPowerUp(type) {
    const powerUp = POWER_UP_TYPES[type];
    if (!powerUp) return;
    
    const effect = {
        type: type,
        startTime: Date.now(),
        endTime: Date.now() + powerUp.duration,
        ...powerUp
    };
    
    gameState.playerEffects.set(type, effect);
    console.log(`パワーアップ適用: ${powerUp.name}`);
    
    addPowerUpEffect(type);
    gameState.score += 50;
    updateUI();
}

// パワーアップ効果の視覚表現
function addPowerUpEffect(type) {
    const powerUp = POWER_UP_TYPES[type];
    
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMaterial = new THREE.MeshStandardMaterial({ 
        color: powerUp.color,
        emissive: new THREE.Color(powerUp.color).multiplyScalar(0.5)
    });
    
    for (let i = 0; i < 10; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.set(
            (Math.random() - 0.5) * 4,
            Math.random() * 2 + 1,
            (Math.random() - 0.5) * 4
        );
        
        controls.getObject().add(particle);
        
        const duration = 2000;
        const startTime = Date.now();
        
        function animateParticle() {
            const elapsed = Date.now() - startTime;
            const progress = elapsed / duration;
            
            if (progress < 1) {
                particle.position.y += 0.02;
                particle.material.opacity = 1 - progress;
                particle.scale.setScalar(1 - progress * 0.5);
                requestAnimationFrame(animateParticle);
            } else {
                controls.getObject().remove(particle);
            }
        }
        
        animateParticle();
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

document.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
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
            const jumpMultiplier = gameState.playerEffects.has('JUMP_BOOST') ? 
                POWER_UP_TYPES.JUMP_BOOST.multiplier : 1;
            velocity.y += 12 * jumpMultiplier;
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
            moveBackward = true; // 修正: 前進を後退に
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyS':
            moveForward = true; // 修正: 後退を前進に
            break;
        case 'KeyD':
            moveRight = true;
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
            moveBackward = false; // 修正: 前進を後退に
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyS':
            moveForward = false; // 修正: 後退を前進に
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
    processPowerUpEffects();

    // 移動速度の計算（スピードブースト考慮）
    const speedMultiplier = gameState.playerEffects.has('SPEED_BOOST') ? 
        POWER_UP_TYPES.SPEED_BOOST.multiplier : 1;

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

    // 移動速度の適用
    const moveSpeed = 300.0 * speedMultiplier;
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

    // オーブとの衝突判定
    for (const id in orbs) {
        const orb = orbs[id];
        const distance = controls.getObject().position.distanceTo(orb.position);
        if (distance < 1.2) {
            ws.send(JSON.stringify({ type: 'eat_orb', orbId: id }));
            gameState.score += 10;
        }
    }

    // パワーアップとの衝突判定
    for (const id in powerUps) {
        const powerUp = powerUps[id];
        const distance = controls.getObject().position.distanceTo(powerUp.position);
        if (distance < 1.5) {
            ws.send(JSON.stringify({ 
                type: 'collect_powerup', 
                powerUpId: id,
                powerUpType: powerUp.userData.type
            }));
        }
    }

    // オーブの回転アニメーション
    for (const id in orbs) {
        orbs[id].rotation.y += delta * 2;
        orbs[id].position.y = 0.5 + Math.sin(time * 0.003 + parseFloat(id.slice(4)) * 0.5) * 0.3;
    }

    // パワーアップの回転アニメーション
    for (const id in powerUps) {
        const powerUp = powerUps[id];
        powerUp.rotation.y += delta * 1.5;
        powerUp.position.y = 1.0 + Math.sin(time * 0.004 + parseFloat(id.slice(8)) * 0.7) * 0.4;
        
        // リングの回転
        if (powerUp.userData.ring) {
            powerUp.userData.ring.rotation.z += delta * 3;
        }
    }

    // 透明化効果の適用
    applyInvisibilityEffect();

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

// 鬼ごっこの判定
setInterval(() => {
    if (!isConnected || myId !== oniId) return;
    
    // シールド効果のチェック
    const hasShield = gameState.playerEffects.has('SHIELD');
    
    for (const id in players) {
        if (id === myId) continue;
        const otherPlayer = players[id];
        const distance = controls.getObject().position.distanceTo(otherPlayer.position);
        if (distance < 2.5 && !hasShield) {
            ws.send(JSON.stringify({ 
                type: 'tag_player', 
                id: myId,
                taggedId: id 
            }));
            break;
        }
    }
}, 300);