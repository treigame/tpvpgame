import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

let myId = null;
let players = {};
let redItems = {};
let snowballs = {};
let oniId = null;
let isConnected = false;
let canThrowSnowball = false;
let showExclamation = false;
let gameStarted = false;
let gameCountdown = -1;
let waitingForPlayers = false;
let isSpawned = false;
let playerRank = null;
let isFlying = false;
let flightEnabled = false;
let isSwordSwinging = false;
let isStunned = false;
let stunEndTime = 0;

// ゲームモード関連
let gameMode = null;
let votingActive = false;
let myHP = 10;
let isAlive = true;

let gameState = {
    score: 0,
    redItemsCollected: 0,
    timeAsOni: 0,
    timeAlive: 0,
    gameStartTime: Date.now(),
    oniStartTime: null,
    minimapCanvas: null,
    minimapCtx: null,
    gameTimeLimit: 240,
    roundStartTime: null
};

let isTabletMode = false;
let touchStartX = 0;
let touchStartY = 0;
let isTouchingUI = false;

ws.onopen = () => {
    console.log('WebSocket接続が確立されました');
    isConnected = true;
    ws.send(JSON.stringify({ type: 'get_id' }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.id;
        oniId = data.oniId;
        gameStarted = data.gameStarted || false;
        waitingForPlayers = data.waitingForPlayers || false;
        gameMode = data.gameMode || null;
        votingActive = data.votingActive || false;
        
        createUI();
        createVotingUI();
        createHPUI();
        createSettingsUI();
        
        if (votingActive) {
            showVotingUI();
        }
        
        if (!gameStarted && waitingForPlayers) {
            controls.getObject().position.set(0, 1.7, 0);
            isSpawned = false;
            showMessage('他のプレイヤーを待っています...', 'info', 3000);
        } else if (gameStarted) {
            controls.getObject().position.set(0, 1.7, 0);
            isSpawned = true;
            canJump = true;
        }
        
        if (myId === oniId && gameStarted) {
            gameState.oniStartTime = Date.now();
            addSword(camera);
        } else {
            addRightHand(camera);
        }
        
        for (const id in data.players) {
            if (id !== myId) createPlayerMesh(id, data.players[id]);
        }
        
        for (const id in data.redItems || {}) {
            createRedItemMesh(id, data.redItems[id]);
        }
        
        updateUI();
    } else if (data.type === 'force_position') {
        controls.getObject().position.set(data.x, data.y, data.z);
        velocity.set(0, 0, 0);
        canJump = true;
    } else if (data.type === 'waiting_for_players') {
        waitingForPlayers = true;
        gameStarted = false;
        controls.getObject().position.set(0, 1.7, 0);
        isSpawned = false;
        showMessage(`プレイヤー待機中 (${data.currentPlayers}/3)`, 'info', 2000);
    
    } else if (data.type === 'voting_start') {
        votingActive = true;
        showVotingUI();
    } else if (data.type === 'vote_update') {
        const voteStatus = document.getElementById('vote-status');
        if (voteStatus) {
            voteStatus.textContent = `投票数: PVP=${data.votes.pvp}, Tag=${data.votes.tag}, Parcour=${data.votes.parcour}`;
        }
    } else if (data.type === 'voting_result') {
        gameMode = data.mode;
        hideVotingUI();
        showMessage(`${data.mode.toUpperCase()}モードに決定！`, 'success', 3000);
    } else if (data.type === 'game_start') {
        gameStarted = true;
        gameMode = data.mode;
        
        if (gameMode === 'pvp') {
            myHP = 10;
            isAlive = true;
            showHPUI();
            updateHPUI(10);
            removeObstacles();
            showMessage('⚔️ PVPモード開始！', 'success', 3000);
        }
    } else if (data.type === 'pvp_damage') {
        if (data.targetId === myId) {
            myHP = data.hp;
            updateHPUI(myHP);
            velocity.y = 10;
            showMessage(`攻撃を受けた！ HP: ${myHP}/10`, 'error', 2000);
        }
    } else if (data.type === 'pvp_death') {
        if (data.playerId === myId) {
            isAlive = false;
            showMessage('倒された！観戦モードに移行します', 'error', 5000);
        }
    } else if (data.type === 'pvp_winner') {
        const winnerMsg = data.winnerId === myId ? '🏆 あなたの勝利！' : `勝者: ${data.winnerId}`;
        showMessage(winnerMsg, 'success', 5000);
    } else if (data.type === 'game_reset') {
        gameMode = null;
        votingActive = false;
        myHP = 10;
        isAlive = true;
        hideHPUI();
    } else if (data.type === 'game_countdown') {
        gameCountdown = data.countdown;
        if (data.countdown > 0) {
            showMessage(`ゲーム開始まで ${data.countdown}秒`, 'info', 1000);
        } else {
            showMessage('START!', 'success', 1500);
            startGame();
        }
    } else if (data.type === 'game_over') {
        const winner = data.winner === 'players' ? 'Players Win!' : 'Tiger Wins!';
        showMessage(winner, 'success', 10000);
        setTimeout(() => location.reload(), 10000);
    } else if (data.type === 'player_update') {
        if (data.id !== myId) {
            if (!players[data.id]) {
                createPlayerMesh(data.id, data);
            } else {
                const player = players[data.id];
                const targetPos = new THREE.Vector3(data.x, data.y, data.z);
                player.position.lerp(targetPos, 0.3);
            }
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
            if (gameState.redItemsCollected >= 8) {
                canThrowSnowball = true;
                addSnowball(camera);
                showMessage('雪玉が投げられます！', 'success', 3000);
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
            showMessage('雪玉が鬼に命中！', 'success', 5000);
            setTimeout(() => location.reload(), 3000);
        }
    } else if (data.type === 'items_respawned') {
        for (const id in redItems) {
            scene.remove(redItems[id]);
        }
        redItems = {};
        for (const id in data.redItems) {
            createRedItemMesh(id, data.redItems[id]);
        }
    } else if (data.type === 'item_respawned') {
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
        
        console.log(`🔄 鬼変更受信: ${oldOni} → ${oniId}, 自分: ${myId}`);
        
        if (data.taggedPlayerId === myId) {
            isStunned = true;
            stunEndTime = Date.now() + 5000;
            showMessage('5秒間スタン！', 'error', 5000);
            velocity.set(0, 0, 0);
        }
        
        if (oldOni === myId && gameState.oniStartTime) {
            gameState.timeAsOni += Date.now() - gameState.oniStartTime;
            gameState.oniStartTime = null;
            removeSword(camera);
            removeSnowball(camera);
            addRightHand(camera);
        }
        
        if (oniId === myId) {
            gameState.oniStartTime = Date.now();
            removeRightHand(camera);
            removeSnowball(camera);
            addSword(camera);
            canThrowSnowball = false;
            gameState.redItemsCollected = 0;
        }
        
        for (const id in players) {
            if (id === oniId) {
                removeRightHand(players[id]);
                removeSnowball(players[id]);
                addSword(players[id]);
            } else {
                removeSword(players[id]);
                removeSnowball(players[id]);
                addRightHand(players[id]);
            }
        }
        
        updatePlayerColors();
        updateUI();
    } else if (data.type === 'player_rank_updated') {
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
    console.log('WebSocket接続が切断されました');
    isConnected = false;
};

ws.onerror = (error) => {
    console.error('WebSocket エラー:', error);
    isConnected = false;
};

function startGame() {
    gameStarted = true;
    gameCountdown = -1;
    waitingForPlayers = false;
    isSpawned = true;
    controls.getObject().position.y = 1.7;
    velocity.set(0, 0, 0);
    canJump = true;
    gameState.roundStartTime = Date.now();
    window.oneMinuteWarningShown = false;
    window.thirtySecWarningShown = false;
    window.fifteenSecWarningShown = false;
    for (let i = 1; i <= 5; i++) {
        window[`sec${i}Shown`] = false;
    }
    showMessage('ゲーム開始！', 'success', 2000);
}

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8B7355, 80, 200);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffe4b5, 1.2);
directionalLight.position.set(20, 50, 20);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

const planeGeometry = new THREE.PlaneGeometry(200, 200);
const canvas = document.createElement('canvas');
canvas.width = 512;
canvas.height = 512;
const ctx = canvas.getContext('2d');

const baseColor = '#8B7355';
ctx.fillStyle = baseColor;
ctx.fillRect(0, 0, 512, 512);

for (let i = 0; i < 50; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const width = 2 + Math.random() * 8;
    const height = 20 + Math.random() * 100;
    const opacity = 0.1 + Math.random() * 0.2;
    ctx.fillStyle = `rgba(101, 67, 33, ${opacity})`;
    ctx.fillRect(x, y, width, height);
}

for (let i = 0; i < 20; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = 5 + Math.random() * 15;
    ctx.fillStyle = `rgba(80, 50, 20, ${0.2 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

const woodTexture = new THREE.CanvasTexture(canvas);
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(20, 20);

const planeMaterial = new THREE.MeshStandardMaterial({ 
    map: woodTexture,
    roughness: 0.9,
    metalness: 0.0
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1;
plane.receiveShadow = true;
scene.add(plane);

const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const WALL_THICKNESS = 4;

const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B6F47,
    roughness: 0.8,
    metalness: 0.1
});

const walls = [];
const blocks = [];

const wall1 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
wall1.position.set(0, (WALL_HEIGHT / 2) - 1, -WALL_SIZE / 2);
wall1.receiveShadow = true;
wall1.castShadow = true;
scene.add(wall1);
walls.push(wall1);
blocks.push(wall1);

const wall2 = new THREE.Mesh(new THREE.BoxGeometry(WALL_SIZE, WALL_HEIGHT, WALL_THICKNESS), wallMaterial);
wall2.position.set(0, (WALL_HEIGHT / 2) - 1, WALL_SIZE / 2);
wall2.receiveShadow = true;
wall2.castShadow = true;
scene.add(wall2);
walls.push(wall2);
blocks.push(wall2);

const wall3 = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall3.position.set(-WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall3.receiveShadow = true;
wall3.castShadow = true;
scene.add(wall3);
walls.push(wall3);
blocks.push(wall3);

const wall4 = new THREE.Mesh(new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_SIZE), wallMaterial);
wall4.position.set(WALL_SIZE / 2, (WALL_HEIGHT / 2) - 1, 0);
wall4.receiveShadow = true;
wall4.castShadow = true;
scene.add(wall4);
walls.push(wall4);
blocks.push(wall4);

function createInfinityFortressBuildings() {
    const buildingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8B6F47,
        roughness: 0.7,
        metalness: 0.2
    });
    
    const accentMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xd4af37,
        roughness: 0.3,
        metalness: 0.7,
        emissive: 0x8B7500,
        emissiveIntensity: 0.2
    });

    const buildings = [
        { pos: [0, 8, 0], size: [15, 16, 15], material: buildingMaterial },
        { pos: [0, 18, 0], size: [10, 6, 10], material: accentMaterial },
        { pos: [25, 5, 15], size: [10, 10, 8], rotation: [0, 0.3, 0], material: buildingMaterial },
        { pos: [-25, 6, 20], size: [12, 12, 10], rotation: [0, -0.4, 0.1], material: buildingMaterial },
        { pos: [30, 7, -25], size: [8, 14, 12], rotation: [0, 0.5, -0.1], material: buildingMaterial },
        { pos: [-20, 5, -30], size: [14, 10, 8], rotation: [0, -0.3, 0], material: buildingMaterial },
        { pos: [45, 4, 45], size: [10, 8, 10], material: buildingMaterial },
        { pos: [45, 10, 45], size: [8, 6, 8], material: accentMaterial },
        { pos: [-45, 5, 45], size: [12, 10, 12], material: buildingMaterial },
        { pos: [-45, 12, 45], size: [9, 5, 9], material: accentMaterial },
        { pos: [15, 3, 50], size: [6, 6, 20], material: buildingMaterial },
        { pos: [-15, 3, 50], size: [6, 6, 20], material: buildingMaterial },
        { pos: [0, 3, 65], size: [40, 6, 6], material: buildingMaterial },
        { pos: [60, 6, 20], size: [10, 12, 15], rotation: [0, 0.2, 0], material: buildingMaterial },
        { pos: [-60, 5, -20], size: [15, 10, 10], rotation: [0, -0.3, 0], material: buildingMaterial },
        { pos: [50, 4, -50], size: [12, 8, 12], material: buildingMaterial },
        { pos: [-50, 7, 50], size: [10, 14, 10], material: buildingMaterial },
        { pos: [70, 8, 0], size: [8, 16, 8], material: accentMaterial },
        { pos: [-70, 8, 0], size: [8, 16, 8], material: accentMaterial },
        { pos: [0, 8, 70], size: [8, 16, 8], material: accentMaterial },
        { pos: [0, 8, -70], size: [8, 16, 8], material: accentMaterial }
    ];

    buildings.forEach((building) => {
        const geometry = new THREE.BoxGeometry(...building.size);
        const mesh = new THREE.Mesh(geometry, building.material);
        mesh.position.set(...building.pos);
        if (building.rotation) mesh.rotation.set(...building.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        blocks.push(mesh);
        
        if (Math.random() > 0.6) {
            const accentGeom = new THREE.BoxGeometry(building.size[0] * 1.1, 0.5, building.size[2] * 1.1);
            const accent = new THREE.Mesh(accentGeom, accentMaterial);
            accent.position.set(building.pos[0], building.pos[1] + building.size[1]/2, building.pos[2]);
            accent.castShadow = true;
            scene.add(accent);
        }
    });
}

createInfinityFortressBuildings();


// 投票UI作成
function createVotingUI() {
    const votingUI = document.createElement('div');
    votingUI.id = 'voting-ui';
    votingUI.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.95);
        padding: 40px;
        border-radius: 20px;
        border: 3px solid #00ff00;
        z-index: 10000;
        display: none;
        text-align: center;
        color: white;
        font-family: Arial, sans-serif;
    `;
    
    votingUI.innerHTML = `
        <h2 style="font-size: 2.5em; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">🎮 ゲームモードを選択</h2>
        <p style="margin-bottom: 30px; font-size: 1.2em;">3つのモードから投票してください</p>
        <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
            <button id="vote-pvp" style="
                padding: 25px 45px;
                font-size: 1.8em;
                background: linear-gradient(135deg, #ff4444, #cc0000);
                color: white;
                border: none;
                border-radius: 15px;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 4px 15px rgba(255,68,68,0.4);
            " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">⚔️ PVP</button>
            <button id="vote-tag" style="
                padding: 25px 45px;
                font-size: 1.8em;
                background: linear-gradient(135deg, #44ff44, #00cc00);
                color: white;
                border: none;
                border-radius: 15px;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 4px 15px rgba(68,255,68,0.4);
            " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">🏃 Tag</button>
            <button id="vote-parcour" style="
                padding: 25px 45px;
                font-size: 1.8em;
                background: linear-gradient(135deg, #4444ff, #0000cc);
                color: white;
                border: none;
                border-radius: 15px;
                cursor: pointer;
                transition: all 0.3s;
                box-shadow: 0 4px 15px rgba(68,68,255,0.4);
            " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">🧗 Parcour</button>
        </div>
        <div id="vote-status" style="margin-top: 25px; font-size: 1.3em; color: #ffff00;"></div>
    `;
    
    document.body.appendChild(votingUI);
    
    document.getElementById('vote-pvp').addEventListener('click', () => voteForMode('pvp'));
    document.getElementById('vote-tag').addEventListener('click', () => voteForMode('tag'));
    document.getElementById('vote-parcour').addEventListener('click', () => voteForMode('parcour'));
}

function voteForMode(mode) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'vote',
            mode: mode
        }));
        
        document.getElementById('vote-pvp').disabled = true;
        document.getElementById('vote-tag').disabled = true;
        document.getElementById('vote-parcour').disabled = true;
        document.getElementById('vote-status').textContent = `${mode.toUpperCase()}に投票しました！`;
    }
}

function showVotingUI() {
    const votingUI = document.getElementById('voting-ui');
    if (votingUI) {
        votingUI.style.display = 'block';
    }
}

function hideVotingUI() {
    const votingUI = document.getElementById('voting-ui');
    if (votingUI) {
        votingUI.style.display = 'none';
    }
}

// HP UI作成
function createHPUI() {
    const hpUI = document.createElement('div');
    hpUI.id = 'hp-ui';
    hpUI.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        z-index: 1001;
        display: none;
        padding: 10px 20px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 15px;
        border: 2px solid #ff00ff;
    `;
    
    for (let i = 0; i < 10; i++) {
        const heart = document.createElement('div');
        heart.id = `heart-${i}`;
        heart.textContent = '💜';
        heart.style.cssText = 'font-size: 32px; transition: all 0.3s;';
        hpUI.appendChild(heart);
    }
    
    document.body.appendChild(hpUI);
}

function updateHPUI(hp) {
    for (let i = 0; i < 10; i++) {
        const heart = document.getElementById(`heart-${i}`);
        if (heart) {
            if (i < hp) {
                heart.style.display = 'block';
                heart.style.opacity = '1';
            } else {
                heart.style.opacity = '0.3';
                heart.textContent = '🖤';
            }
        }
    }
}

function showHPUI() {
    const hpUI = document.getElementById('hp-ui');
    if (hpUI) hpUI.style.display = 'flex';
}

function hideHPUI() {
    const hpUI = document.getElementById('hp-ui');
    if (hpUI) hpUI.style.display = 'none';
}

// 障害物を削除（PVPモード用）
function removeObstacles() {
    blocks.forEach(block => {
        // 壁以外の建物を削除
        if (Math.abs(block.position.x) < 95 && Math.abs(block.position.z) < 95) {
            scene.remove(block);
        }
    });
}


function createUI() {
    const uiContainer = document.createElement('div');
    uiContainer.id = 'game-ui';
    uiContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 16px;
        z-index: 1000;
        pointer-events: none;
        background: rgba(0, 0, 0, 0.7);
        padding: 15px;
        border-radius: 10px;
        border: 2px solid #00ff00;
        min-width: 200px;
        transition: transform 0.3s ease;
    `;
    
    uiContainer.innerHTML = `
        <div id="player-info">
            <div>プレイヤー: <span id="player-id">${myId}</span></div>
            <div>役割: <span id="role">${myId === oniId ? '👹 鬼' : '🏃 逃走者'}</span></div>
            <div>スコア: <span id="score">${gameState.score}</span></div>
            <div id="red-items-count" style="display: ${myId !== oniId ? 'block' : 'none'}">
                赤いアイテム: <span id="red-items">${gameState.redItemsCollected}</span>/8
            </div>
            <div id="snowball-status" style="display: ${canThrowSnowball ? 'block' : 'none'}; color: #ffffff;">
                ⚪ 雪玉投擲可能！
            </div>
        </div>
        <div id="timer-info" style="margin-top: 10px;">
            <div>ゲーム時間: <span id="game-time">00:00</span> | 残り: <span id="remaining-time">04:00</span></div>
            <div id="oni-time" style="display: ${myId === oniId ? 'block' : 'none'}">
                鬼時間: <span id="oni-duration">00:00</span></div>
        </div>
        <div id="instructions" style="margin-top: 15px; font-size: 14px; opacity: 0.8;">
            <div>WASD/矢印: 移動 | Space: ジャンプ | マウス: 視点</div>
            <div>クリック: 雪玉/鬼交代</div>
        </div>
    `;
    
    document.body.appendChild(uiContainer);
    createMinimap();
}

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
    canvas.style.cssText = 'position: absolute; top: 2px; left: 2px; border-radius: 8px;';
    
    minimapContainer.appendChild(canvas);
    document.body.appendChild(minimapContainer);
    
    gameState.minimapCanvas = canvas;
    gameState.minimapCtx = canvas.getContext('2d');
}

function createPlayerMesh(id, data) {
    const group = new THREE.Group();
    
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
    } else {
        addRightHand(group);
    }
    
    return group;
}

function updatePlayerColors() {
    for (const id in players) {
        const player = players[id];
        if (player.bodyMesh) {
            player.bodyMesh.material.color.setHex(id === oniId ? 0x0000ff : 0x00ff00);
        }
    }
}

function addRightHand(mesh) {
    if (mesh.rightHand) return;
    
    const handGroup = new THREE.Group();
    
    const handMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffdbac,
        roughness: 0.6,
        metalness: 0.0
    });
    
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8), handMaterial);
    rightArm.position.set(0.6, -0.2, -0.3);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    handGroup.add(rightArm);
    
    mesh.add(handGroup);
    mesh.rightHand = handGroup;
}

function removeRightHand(mesh) {
    if (mesh.rightHand) {
        mesh.remove(mesh.rightHand);
        mesh.rightHand = null;
    }
}

function addSnowball(mesh) {
    if (mesh.heldSnowball) return;
    
    const snowballGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const snowballMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });
    const snowball = new THREE.Mesh(snowballGeometry, snowballMaterial);
    snowball.position.set(0.8, -0.6, -0.5);
    snowball.castShadow = true;
    
    mesh.add(snowball);
    mesh.heldSnowball = snowball;
}

function removeSnowball(mesh) {
    if (mesh.heldSnowball) {
        mesh.remove(mesh.heldSnowball);
        mesh.heldSnowball = null;
    }
}

function addSword(mesh) {
    if (mesh.sword) return;
    
    const swordGroup = new THREE.Group();
    
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
    
    swordGroup.position.set(1.0, -1.2, -0.5);
    swordGroup.rotation.x = Math.PI / 4;
    swordGroup.rotation.y = -Math.PI / 6;
    
    mesh.add(swordGroup);
    mesh.sword = swordGroup;
}

function removeSword(mesh) {
    if (mesh.sword) {
        mesh.remove(mesh.sword);
        mesh.sword = null;
    }
}

function swingSword() {
    if (!camera.sword || isSwordSwinging) return;
    
    isSwordSwinging = true;
    const sword = camera.sword;
    const originalRotation = { x: sword.rotation.x, y: sword.rotation.y, z: sword.rotation.z };
    
    const swingDuration = 300;
    const startTime = Date.now();
    
    function animateSwing() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / swingDuration, 1);
        
        if (progress < 0.5) {
            const swingProgress = progress * 2;
            sword.rotation.x = originalRotation.x - Math.PI / 3 * swingProgress;
            sword.rotation.y = originalRotation.y + Math.PI / 6 * swingProgress;
        } else {
            const returnProgress = (progress - 0.5) * 2;
            sword.rotation.x = originalRotation.x - Math.PI / 3 * (1 - returnProgress);
            sword.rotation.y = originalRotation.y + Math.PI / 6 * (1 - returnProgress);
        }
        
        if (progress < 1) {
            requestAnimationFrame(animateSwing);
        } else {
            sword.rotation.x = originalRotation.x;
            sword.rotation.y = originalRotation.y;
            sword.rotation.z = originalRotation.z;
            isSwordSwinging = false;
        }
    }
    
    animateSwing();
}

function addRankDisplay(mesh, rank) {
    if (mesh.rankDisplay) return;
    
    const rankGroup = new THREE.Group();
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
    
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.fillText(rank, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        alphaTest: 0.1
    });
    
    const textGeometry = new THREE.PlaneGeometry(2, 0.5);
    const textMesh = new THREE.Mesh(textGeometry, textMaterial);
    textMesh.position.y = 0.1;
    rankGroup.add(textMesh);
    
    rankGroup.position.set(0, 3.5, 0);
    rankGroup.lookAt(camera.position);
    
    mesh.add(rankGroup);
    mesh.rankDisplay = rankGroup;
}

function removeRankDisplay(mesh) {
    if (mesh.rankDisplay) {
        mesh.remove(mesh.rankDisplay);
        mesh.rankDisplay = null;
    }
}

function createRedItemMesh(id, data) {
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
    
    const pointLight = new THREE.PointLight(0xff0000, 2, 10);
    pointLight.position.copy(mesh.position);
    scene.add(pointLight);
    mesh.userData.light = pointLight;
    
    scene.add(mesh);
    redItems[id] = mesh;
    
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
    
    return mesh;
}

function createSnowballMesh(id, data) {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        roughness: 0.8,
        metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    mesh.castShadow = true;
    scene.add(mesh);
    snowballs[id] = mesh;
    
    const startTime = Date.now();
    const duration = 2000;
    const startPos = new THREE.Vector3(data.x, data.y, data.z);
    const endPos = new THREE.Vector3(data.targetX, data.targetY, data.targetZ);
    
    function animateSnowball() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        if (progress < 1) {
            mesh.position.lerpVectors(startPos, endPos, progress);
            mesh.position.y += Math.sin(progress * Math.PI) * 3;
            requestAnimationFrame(animateSnowball);
        } else {
            scene.remove(mesh);
            delete snowballs[id];
        }
    }
    animateSnowball();
    
    return mesh;
}

function showExclamationMark() {
    let exclamation = document.getElementById('exclamation-mark');
    if (exclamation) {
        exclamation.style.display = 'block';
    } else {
        exclamation = document.createElement('div');
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
        `;
        
        exclamation.addEventListener('click', () => {
            if (showExclamation && myId !== oniId) {
                ws.send(JSON.stringify({ type: 'become_oni', playerId: myId }));
            }
        });
        
        document.body.appendChild(exclamation);
    }
}

function hideExclamationMark() {
    const exclamation = document.getElementById('exclamation-mark');
    if (exclamation) {
        exclamation.style.display = 'none';
    }
}

function createSettingsUI() {
    const settingsButton = document.createElement('div');
    settingsButton.id = 'settings-button';
    settingsButton.innerHTML = '⚙️';
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
        font-size: 20px;
        z-index: 1001;
    `;
    
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
        z-index: 1002;
        display: none;
        min-width: 200px;
    `;
    
    settingsMenu.innerHTML = `
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 15px;">設定</div>
        <div id="tablet-toggle" style="background: rgba(255, 255, 255, 0.1); padding: 10px; border-radius: 5px; cursor: pointer; border: 1px solid #ccc; text-align: center; margin-bottom: 10px;">📱 Tablet Mode</div>
        <div style="margin-bottom: 10px;">
            <a href="https://lin.ee/Pn7XBpd" target="_blank" style="display: block; text-align: center;">
                <img src="https://scdn.line-apps.com/n/line_add_friends/btn/en.png" alt="Add friend" height="36" border="0" style="border-radius: 4px;">
            </a>
        </div>
        <div><input type="text" id="code-input" placeholder="Code" style="width: 100%; padding: 8px; border-radius: 4px; margin-bottom: 5px;">
        <button id="code-submit" style="width: 100%; padding: 8px; border-radius: 4px; border: none; background: #007bff; color: white; cursor: pointer;">確認</button></div>
    `;
    
    document.body.appendChild(settingsButton);
    document.body.appendChild(settingsMenu);
    
    settingsButton.addEventListener('click', () => {
        const menu = document.getElementById('settings-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    
    document.addEventListener('click', (event) => {
        const menu = document.getElementById('settings-menu');
        const button = document.getElementById('settings-button');
        if (!menu.contains(event.target) && !button.contains(event.target)) {
            menu.style.display = 'none';
        }
    });
    
    document.getElementById('tablet-toggle').addEventListener('click', () => {
        isTabletMode = !isTabletMode;
        const toggle = document.getElementById('tablet-toggle');
        const gameUI = document.getElementById('game-ui');
        
        if (isTabletMode) {
            toggle.style.backgroundColor = 'rgba(0, 255, 0, 0.3)';
            toggle.innerHTML = '📱 Tablet Mode (ON)';
            if (gameUI) {
                gameUI.style.transform = 'scale(0.7)';
                gameUI.style.transformOrigin = 'top left';
            }
            createTouchControls();
        } else {
            toggle.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            toggle.innerHTML = '📱 Tablet Mode';
            if (gameUI) {
                gameUI.style.transform = 'scale(1)';
            }
            removeTouchControls();
        }
        document.getElementById('settings-menu').style.display = 'none';
    });
    
    document.getElementById('code-submit').addEventListener('click', () => {
        const code = document.getElementById('code-input').value.trim();
        if (code === 'trei0516') {
            playerRank = 'OWNER';
            flightEnabled = true;
            showMessage('OWNERランク付与', 'success', 3000);
            addRankDisplay(camera, 'OWNER');
            ws.send(JSON.stringify({ type: 'set_rank', playerId: myId, rank: 'OWNER' }));
            document.getElementById('code-input').value = '';
            document.getElementById('settings-menu').style.display = 'none';
        } else if (code !== '') {
            showMessage('無効なコード', 'error', 2000);
            document.getElementById('code-input').value = '';
        }
    });
}

function createTouchControls() {
    const joystickLeft = document.createElement('div');
    joystickLeft.id = 'joystick-left';
    joystickLeft.style.cssText = `
        position: fixed;
        bottom: 50px;
        left: 50px;
        width: 120px;
        height: 120px;
        background: rgba(255, 255, 255, 0.3);
        border: 3px solid rgba(255, 255, 255, 0.5);
        border-radius: 50%;
        z-index: 1000;
    `;
    
    const stickLeft = document.createElement('div');
    stickLeft.id = 'stick-left';
    stickLeft.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 50px;
        height: 50px;
        background: rgba(255, 255, 255, 0.7);
        border-radius: 50%;
    `;
    joystickLeft.appendChild(stickLeft);
    document.body.appendChild(joystickLeft);
    
    const jumpButton = document.createElement('div');
    jumpButton.id = 'jump-button';
    jumpButton.innerHTML = '↑';
    jumpButton.style.cssText = `
        position: fixed;
        bottom: 50px;
        right: 50px;
        width: 80px;
        height: 80px;
        background: rgba(0, 255, 0, 0.5);
        border: 3px solid rgba(0, 255, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: white;
        z-index: 1000;
        user-select: none;
    `;
    document.body.appendChild(jumpButton);
    
    const attackButton = document.createElement('div');
    attackButton.id = 'attack-button';
    attackButton.innerHTML = '⚔️';
    attackButton.style.cssText = `
        position: fixed;
        bottom: 150px;
        right: 50px;
        width: 80px;
        height: 80px;
        background: rgba(255, 0, 0, 0.5);
        border: 3px solid rgba(255, 0, 0, 0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        color: white;
        z-index: 1000;
        user-select: none;
    `;
    document.body.appendChild(attackButton);
    
    let touchStartX = 0;
    let touchStartY = 0;
    
    joystickLeft.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isTouchingUI = true;
        const touch = e.touches[0];
        const rect = joystickLeft.getBoundingClientRect();
        touchStartX = rect.left + rect.width / 2;
        touchStartY = rect.top + rect.height / 2;
    });
    
    joystickLeft.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        
        const distance = Math.min(35, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
        const angle = Math.atan2(deltaY, deltaX);
        
        const stickX = Math.cos(angle) * distance;
        const stickY = Math.sin(angle) * distance;
        
        stickLeft.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        moveForward = deltaY < -10;
        moveBackward = deltaY > 10;
        moveLeft = deltaX < -10;
        moveRight = deltaX > 10;
    });
    
    joystickLeft.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouchingUI = false;
        stickLeft.style.transform = 'translate(-50%, -50%)';
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    });
    
    jumpButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isTouchingUI = true;
        if (canJump) {
            velocity.y += 18;
            canJump = false;
        }
    });
    
    jumpButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouchingUI = false;
    });
    
    attackButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isTouchingUI = true;
        if (myId === oniId && gameStarted) {
            swingSword();
            checkSwordAttack();
        } else if (canThrowSnowball && myId !== oniId && gameStarted) {
            throwSnowball();
        }
    });
    
    attackButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        isTouchingUI = false;
    });
    
    renderer.domElement.addEventListener('touchstart', (e) => {
        if (isTouchingUI) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    
    renderer.domElement.addEventListener('touchmove', (e) => {
        if (isTouchingUI) return;
        e.preventDefault();
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        const deltaX = (touchX - touchStartX) * 0.002;
        const deltaY = (touchY - touchStartY) * 0.002;
        
        camera.rotation.y -= deltaX;
        camera.rotation.x -= deltaY;
        camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
        
        touchStartX = touchX;
        touchStartY = touchY;
    });
}

function removeTouchControls() {
    const joystick = document.getElementById('joystick-left');
    const jump = document.getElementById('jump-button');
    const attack = document.getElementById('attack-button');
    
    if (joystick) joystick.remove();
    if (jump) jump.remove();
    if (attack) attack.remove();
}

const controls = new PointerLockControls(camera, document.body);
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
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
    if (!document.pointerLockElement && !isTabletMode) {
        document.body.requestPointerLock();
    }
});

document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement && e.button === 0) {
        if (myId === oniId && gameStarted) {
            swingSword();
            checkSwordAttack();
        } else if (canThrowSnowball && myId !== oniId && gameStarted) {
            throwSnowball();
        }
    }
});

function checkSwordAttack() {
    if (myId !== oniId || !gameStarted || isStunned) return;
    
    for (const id in players) {
        if (id === myId) continue;
        const distance = controls.getObject().position.distanceTo(players[id].position);
        if (distance < 7.5) {
            console.log(`⚔️ 剣攻撃！ 距離 ${distance.toFixed(2)}m - プレイヤー ${id}`);
            ws.send(JSON.stringify({ type: 'sword_attack', oniId: myId, taggedId: id }));
            return;
        }
    }
}

function checkAutoTag() {
    if (myId !== oniId || !gameStarted || isStunned) return;
    
    for (const id in players) {
        if (id === myId) continue;
        const distance = controls.getObject().position.distanceTo(players[id].position);
        if (distance < 2.5) {
            console.log(`🎯 自動タッチ検出: 距離 ${distance.toFixed(2)}m - プレイヤー ${id}`);
            ws.send(JSON.stringify({ type: 'auto_tag', oniId: myId, taggedId: id }));
            return;
        }
    }
}

function throwSnowball() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const playerPos = controls.getObject().position;
    const targetPos = playerPos.clone().add(dir.multiplyScalar(20));
    
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
    removeSnowball(camera);
    updateUI();
}

document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (isStunned && event.code !== 'Space') return;
    
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveBackward = true;  // Changed from moveForward to moveBackward
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveForward = true;  // Changed from moveBackward to moveForward
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'Space':
            event.preventDefault();
            if (flightEnabled && playerRank === 'OWNER') {
                if (!isFlying) {
                    isFlying = true;
                    showMessage('フライト有効', 'success', 2000);
                } else {
                    velocity.y += 25;
                }
            } else {
                if (canJump && !isStunned) {
                    velocity.y += 18;
                    canJump = false;
                }
            }
            break;
        case 'ShiftLeft':
            if (flightEnabled && isFlying) {
                velocity.y -= 25;
            } else if (flightEnabled && playerRank === 'OWNER') {
                isFlying = false;
                showMessage('フライト無効', 'success', 2000);
            }
            break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveBackward = false;  // Changed from moveForward to moveBackward
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveForward = false;  // Changed from moveBackward to moveForward
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = false;
            break;
    }
});
let lastSentPosition = new THREE.Vector3();
let lastSentTime = 0;

function sendPositionUpdate() {
    if (!isConnected || !myId) return;
    const currentTime = performance.now();
    const currentPosition = controls.getObject().position;
    
    if (currentTime - lastSentTime > 50 && currentPosition.distanceTo(lastSentPosition) > 0.1) {
        ws.send(JSON.stringify({ type: 'move', id: myId, x: currentPosition.x, y: currentPosition.y, z: currentPosition.z }));
        lastSentPosition.copy(currentPosition);
        lastSentTime = currentTime;
    }
}

function updateUI() {
    const currentTime = Date.now();
    const gameTime = Math.floor((currentTime - gameState.gameStartTime) / 1000);
    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    
    let remainingSeconds = 0;
    if (gameState.roundStartTime && gameStarted) {
        const elapsed = Math.floor((currentTime - gameState.roundStartTime) / 1000);
        remainingSeconds = Math.max(0, gameState.gameTimeLimit - elapsed);
        
        const remainingMinutes = Math.floor(remainingSeconds / 60);
        const remainingSecs = remainingSeconds % 60;
        
        if (remainingSeconds === 60 && !window.oneMinuteWarningShown) {
            showMessage('1 minute left!', 'info', 3000);
            window.oneMinuteWarningShown = true;
        } else if (remainingSeconds === 30 && !window.thirtySecWarningShown) {
            showMessage('30 seconds left!', 'info', 3000);
            window.thirtySecWarningShown = true;
        } else if (remainingSeconds === 15 && !window.fifteenSecWarningShown) {
            showMessage('15 seconds left!', 'info', 3000);
            window.fifteenSecWarningShown = true;
        } else if (remainingSeconds <= 5 && remainingSeconds > 0) {
            if (!window[`sec${remainingSeconds}Shown`]) {
                showMessage(remainingSeconds.toString(), 'info', 1000);
                window[`sec${remainingSeconds}Shown`] = true;
            }
        }
        
        if (document.getElementById('remaining-time')) {
            document.getElementById('remaining-time').textContent = 
                `${remainingMinutes.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
        }
    }
    
    if (document.getElementById('player-id')) {
        document.getElementById('player-id').textContent = myId;
        document.getElementById('role').textContent = myId === oniId ? '👹 鬼' : '🏃 逃走者';
        document.getElementById('score').textContent = gameState.score;
        document.getElementById('game-time').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        const redItemsElement = document.getElementById('red-items');
        if (redItemsElement) redItemsElement.textContent = gameState.redItemsCollected;
        
        const redItemsCountElement = document.getElementById('red-items-count');
        if (redItemsCountElement) redItemsCountElement.style.display = myId !== oniId ? 'block' : 'none';
        
        const snowballStatusElement = document.getElementById('snowball-status');
        if (snowballStatusElement) snowballStatusElement.style.display = canThrowSnowball ? 'block' : 'none';
    }
    
    updateMinimap();
}

function updateMinimap() {
    if (!gameState.minimapCtx) return;
    const ctx = gameState.minimapCtx;
    const canvas = gameState.minimapCanvas;
    
    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const mapSize = 200;
    const scale = canvas.width / mapSize;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const playerPos = controls.getObject().position;
    
    ctx.fillStyle = '#8B4513';
    blocks.forEach(block => {
        const x = centerX + (block.position.x - playerPos.x) * scale;
        const y = centerY + (block.position.z - playerPos.z) * scale;
        const size = 4;
        if (x > -size && x < canvas.width + size && y > -size && y < canvas.height + size) {
            ctx.fillRect(x - size/2, y - size/2, size, size);
        }
    });
    
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
    
    for (const id in players) {
        const player = players[id];
        const x = centerX + (player.position.x - playerPos.x) * scale;
        const y = centerY + (player.position.z - playerPos.z) * scale;
        if (x > 0 && x < canvas.width && y > 0 && y < canvas.height) {
            ctx.fillStyle = id === oniId ? '#0000ff' : '#00ff00';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
    
    ctx.fillStyle = myId === oniId ? '#0000ff' : '#00ff00';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    ctx.fill();
}

function showMessage(text, type = 'info', duration = 3000) {
    let container = document.getElementById('message-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'message-container';
        container.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3000; max-width: 400px; pointer-events: none;';
        document.body.appendChild(container);
    }
    
    const msg = document.createElement('div');
    msg.style.cssText = `background: ${type === 'success' ? 'rgba(0, 255, 0, 0.8)' : type === 'error' ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 123, 255, 0.8)'}; color: white; padding: 10px 15px; margin: 5px 0; border-radius: 5px; font-weight: bold;`;
    msg.textContent = text;
    container.appendChild(msg);
    
    setTimeout(() => {
        if (msg.parentNode) container.removeChild(msg);
    }, duration);
}

function checkCollisions(targetPosition) {
    const playerRadius = 1.0;
    
    for (const id in players) {
        if (id === myId) continue;
        const otherPlayer = players[id];
        const distance = targetPosition.distanceTo(otherPlayer.position);
        if (distance < playerRadius * 2) {
            return true;
        }
    }
    
    for (const block of blocks) {
        const blockBox = new THREE.Box3().setFromObject(block);
        const playerBox = new THREE.Box3().setFromCenterAndSize(targetPosition, new THREE.Vector3(playerRadius * 2, 3.4, playerRadius * 2));
        if (blockBox.intersectsBox(playerBox)) return true;
    }
    return false;
}

function checkRedItemCollection() {
    if (!gameStarted) return;
    const playerPosition = controls.getObject().position;
    for (const id in redItems) {
        const item = redItems[id];
        if (playerPosition.distanceTo(item.position) < 2.0) {
            ws.send(JSON.stringify({ type: 'collect_red_item', playerId: myId, itemId: id }));
            break;
        }
    }
}


function performPVPAttack() {
    let closestPlayer = null;
    let closestDistance = Infinity;
    
    for (const id in players) {
        if (id !== myId && players[id]) {
            const playerPos = players[id].position;
            const myPos = controls.getObject().position;
            const distance = myPos.distanceTo(playerPos);
            
            if (distance < closestDistance && distance < 5.0) {
                closestDistance = distance;
                closestPlayer = id;
            }
        }
    }
    
    if (closestPlayer && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'pvp_attack',
            targetId: closestPlayer
        }));
        
        if (isSwordSwinging) return;
        
        isSwordSwinging = true;
        const sword = camera.children.find(child => child.userData.isSword);
        if (sword) {
            const startRotation = sword.rotation.z;
            const swingAnimation = setInterval(() => {
                sword.rotation.z -= 0.3;
                if (sword.rotation.z <= startRotation - Math.PI / 2) {
                    clearInterval(swingAnimation);
                    setTimeout(() => {
                        sword.rotation.z = startRotation;
                        isSwordSwinging = false;
                    }, 100);
                }
            }, 16);
        } else {
            setTimeout(() => { isSwordSwinging = false; }, 300);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    if (!isConnected) {
        renderer.render(scene, camera);
        return;
    }
    
    if (isStunned) {
        if (Date.now() >= stunEndTime) {
            isStunned = false;
            showMessage('スタン解除！', 'success', 2000);
        } else {
            moveForward = false;
            moveBackward = false;
            moveLeft = false;
            moveRight = false;
            velocity.x = 0;
            velocity.z = 0;
        }
    }
    
    if (isFlying && flightEnabled) {
        handleFlightMovement();
    } else if (waitingForPlayers || !gameStarted) {
        if (controls.getObject().position.y !== 1.7) {
            controls.getObject().position.y = 1.7;
        }
        velocity.set(0, 0, 0);
        canJump = true;
        handleNormalMovement();
    } else if (gameStarted && isSpawned) {
        handleNormalMovement();
        checkAutoTag();
        
        const mapLimit = 98;
        const pos = controls.getObject().position;
        if (pos.x < -mapLimit) pos.x = -mapLimit;
        if (pos.x > mapLimit) pos.x = mapLimit;
        if (pos.z < -mapLimit) pos.z = -mapLimit;
        if (pos.z > mapLimit) pos.z = mapLimit;
        
        checkRedItemCollection();
    }
    
    sendPositionUpdate();
    updateUI();
    renderer.render(scene, camera);
    
    const time = Date.now() * 0.001;
    for (const id in redItems) {
        const item = redItems[id];
        item.rotation.y = time;
        if (!item.userData.originalY) item.userData.originalY = item.position.y;
        item.position.y = item.userData.originalY + Math.sin(time * 2) * 0.3;
    }
    
    for (const id in players) {
        if (players[id].rankDisplay) {
            players[id].rankDisplay.lookAt(camera.position);
        }
    }
}

function handleFlightMovement() {
    const inputDir = new THREE.Vector3();
    if (moveForward) inputDir.z -= 1;
    if (moveBackward) inputDir.z += 1;
    if (moveLeft) inputDir.x -= 1;
    if (moveRight) inputDir.x += 1;
    if (inputDir.length() > 0) inputDir.normalize();
    
    const speed = 100.0;
    const deltaTime = 1/60;
    const currentPos = controls.getObject().position.clone();
    
    if (inputDir.z !== 0) {
        const moveVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(moveVector);
        moveVector.y = 0;
        moveVector.normalize();
        moveVector.multiplyScalar(inputDir.z * speed * deltaTime);
        currentPos.add(moveVector);
    }
    
    if (inputDir.x !== 0) {
        const strafeVector = new THREE.Vector3();
        controls.getObject().getWorldDirection(strafeVector);
        strafeVector.cross(controls.getObject().up);
        strafeVector.y = 0;
        strafeVector.normalize();
        strafeVector.multiplyScalar(inputDir.x * speed * deltaTime);
        currentPos.add(strafeVector);
    }
    
    controls.getObject().position.x = currentPos.x;
    controls.getObject().position.z = currentPos.z;
    velocity.y *= 0.85;
    controls.getObject().position.y += velocity.y * (1/60);
    
    if (controls.getObject().position.y > 200) {
        controls.getObject().position.y = 200;
        velocity.y = 0;
    }
}

function handleNormalMovement() {
    if (isStunned) {
        velocity.y -= 50.0 * (1/60);
        if (controls.getObject().position.y <= 1.7) {
            velocity.y = 0;
            controls.getObject().position.y = 1.7;
            canJump = true;
        }
        controls.getObject().position.y += velocity.y * (1/60);
        return;
    }
    
    const inputDir = new THREE.Vector3();
    if (moveForward) inputDir.z -= 1;
    if (moveBackward) inputDir.z += 1;
    if (moveLeft) inputDir.x -= 1;
    if (moveRight) inputDir.x += 1;
    if (inputDir.length() > 0) inputDir.normalize();
    
    const speed = 54.0;
    const deltaTime = 1/60;
    
    const forward = new THREE.Vector3();
    controls.getObject().getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3();
    right.crossVectors(forward, controls.getObject().up).normalize();
    
    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(forward, inputDir.z * speed * deltaTime);
    moveVector.addScaledVector(right, inputDir.x * speed * deltaTime);
    
    const currentPos = controls.getObject().position.clone();
    const newPos = currentPos.clone().add(moveVector);
    newPos.y = currentPos.y;
    
    if (!checkCollisions(newPos)) {
        controls.getObject().position.x = newPos.x;
        controls.getObject().position.z = newPos.z;
    }
    
    velocity.y -= 50.0 * deltaTime;
    
    if (controls.getObject().position.y <= 1.7) {
        velocity.y = 0;
        controls.getObject().position.y = 1.7;
        canJump = true;
    }
    
    controls.getObject().position.y += velocity.y * deltaTime;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();