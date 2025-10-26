import * as THREE from 'three';

// グローバル変数
let scene, camera, renderer, socket;
let myPlayer, players = {};
let myId = null;
let oniId = null;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
const objects = [];

// ゲームモード
let gameMode = null;
let gameStarted = false;
let votingActive = false;
let myHP = 10;
let isAlive = true;

// タブレットモード
let isTabletMode = false;
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };
let joystickHandle = { x: 0, y: 0 };

// UI要素
let votingUI, hpUI;

// 投票UI作成
function createVotingUI() {
    votingUI = document.createElement('div');
    votingUI.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
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
        <h2 style="font-size: 2em; margin-bottom: 20px;">🎮 ゲームモードを選択</h2>
        <p style="margin-bottom: 30px;">3つのモードから選んでください</p>
        <div style="display: flex; gap: 20px; justify-content: center;">
            <button id="vote-pvp" style="
                padding: 20px 40px;
                font-size: 1.5em;
                background: #ff4444;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s;
            ">⚔️ PVP</button>
            <button id="vote-tag" style="
                padding: 20px 40px;
                font-size: 1.5em;
                background: #44ff44;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s;
            ">🏃 Tag</button>
            <button id="vote-parcour" style="
                padding: 20px 40px;
                font-size: 1.5em;
                background: #4444ff;
                color: white;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s;
            ">🧗 Parcour</button>
        </div>
        <div id="vote-status" style="margin-top: 20px; font-size: 1.2em;"></div>
    `;
    
    document.body.appendChild(votingUI);
    
    // 投票ボタンのイベント
    document.getElementById('vote-pvp').addEventListener('click', () => vote('pvp'));
    document.getElementById('vote-tag').addEventListener('click', () => vote('tag'));
    document.getElementById('vote-parcour').addEventListener('click', () => vote('parcour'));
}

function vote(mode) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'vote',
            mode: mode
        }));
        
        // ボタンを無効化
        document.getElementById('vote-pvp').disabled = true;
        document.getElementById('vote-tag').disabled = true;
        document.getElementById('vote-parcour').disabled = true;
        document.getElementById('vote-status').textContent = `${mode}に投票しました！`;
    }
}

function showVotingUI() {
    votingUI.style.display = 'block';
}

function hideVotingUI() {
    votingUI.style.display = 'none';
}

// HP UI作成
function createHPUI() {
    hpUI = document.createElement('div');
    hpUI.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        z-index: 1001;
        display: none;
    `;
    
    for (let i = 0; i < 10; i++) {
        const heart = document.createElement('div');
        heart.id = `heart-${i}`;
        heart.textContent = '💜';
        heart.style.fontSize = '30px';
        hpUI.appendChild(heart);
    }
    
    document.body.appendChild(hpUI);
}

function updateHPUI(hp) {
    for (let i = 0; i < 10; i++) {
        const heart = document.getElementById(`heart-${i}`);
        if (heart) {
            heart.style.display = i < hp ? 'block' : 'none';
        }
    }
}

function showHPUI() {
    hpUI.style.display = 'flex';
}

function hideHPUI() {
    hpUI.style.display = 'none';
}

// 初期化
function init() {
    // シーン作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 200);
    
    // カメラ作成
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 1.7;
    
    // レンダラー作成
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    // 地面作成
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x90EE90 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    objects.push(ground);
    
    // 壁作成
    createWalls();
    
    // プレイヤー作成
    myPlayer = createPlayer(0x0000ff);
    scene.add(myPlayer);
    
    // UI作成
    createVotingUI();
    createHPUI();
    
    // WebSocket接続
    connectWebSocket();
    
    // イベントリスナー
    setupEventListeners();
    
    // ポインターロック
    renderer.domElement.addEventListener('click', () => {
        renderer.domElement.requestPointerLock();
    });
    
    // アニメーションループ
    animate();
}

function createWalls() {
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const wallHeight = 10;
    const wallThickness = 1;
    const mapSize = 100;
    
    // 4つの壁
    const walls = [
        { x: 0, z: mapSize, rotY: 0 }, // 北
        { x: 0, z: -mapSize, rotY: 0 }, // 南
        { x: mapSize, z: 0, rotY: Math.PI / 2 }, // 東
        { x: -mapSize, z: 0, rotY: Math.PI / 2 }, // 西
    ];
    
    walls.forEach(w => {
        const wallGeometry = new THREE.BoxGeometry(200, wallHeight, wallThickness);
        const wall = new THREE.Mesh(wallGeometry, wallMaterial);
        wall.position.set(w.x, wallHeight / 2, w.z);
        wall.rotation.y = w.rotY;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        objects.push(wall);
    });
}

function createPlayer(color) {
    const playerGroup = new THREE.Group();
    
    // 体
    const bodyGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: color });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.6;
    body.castShadow = true;
    playerGroup.add(body);
    
    // 頭
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xFFDBAC });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.5;
    head.castShadow = true;
    playerGroup.add(head);
    
    // 剣（PVPモード用、最初は非表示）
    const swordGroup = new THREE.Group();
    const bladeGeometry = new THREE.BoxGeometry(0.1, 1.5, 0.05);
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xC0C0C0 });
    const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
    blade.position.y = 0.75;
    swordGroup.add(blade);
    
    const handleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.y = -0.15;
    swordGroup.add(handle);
    
    swordGroup.position.set(0.5, 1.0, 0);
    swordGroup.rotation.z = -Math.PI / 4;
    swordGroup.visible = false;
    playerGroup.add(swordGroup);
    playerGroup.userData.sword = swordGroup;
    
    return playerGroup;
}

function setupEventListeners() {
    // キーボード操作
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // マウス操作（視点移動）
    document.addEventListener('mousemove', onMouseMove);
    
    // ウィンドウリサイズ
    window.addEventListener('resize', onWindowResize);
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            if (canJump) {
                velocity.y = 8;
                canJump = false;
            }
            break;
        case 'Mouse0': // 左クリック（攻撃）
            if (gameMode === 'pvp' && isAlive) {
                performAttack();
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            moveForward = false;
            break;
        case 'KeyS':
            moveBackward = false;
            break;
        case 'KeyA':
            moveLeft = false;
            break;
        case 'KeyD':
            moveRight = false;
            break;
    }
}

let mouseX = 0, mouseY = 0;
let rotationX = 0, rotationY = 0;

function onMouseMove(event) {
    if (document.pointerLockElement === renderer.domElement) {
        mouseX = event.movementX || 0;
        mouseY = event.movementY || 0;
        
        // 視点操作（上下左右のみ）
        rotationY -= mouseX * 0.002;
        rotationX -= mouseY * 0.002;
        
        // 上下の視点制限
        rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationX));
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function performAttack() {
    // 最も近いプレイヤーを攻撃
    let closestPlayer = null;
    let closestDistance = Infinity;
    
    for (const pid in players) {
        if (pid !== myId) {
            const player = players[pid];
            const distance = myPlayer.position.distanceTo(player.position);
            if (distance < closestDistance && distance < 5.0) {
                closestDistance = distance;
                closestPlayer = pid;
            }
        }
    }
    
    if (closestPlayer && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'sword_attack',
            targetId: closestPlayer
        }));
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('WebSocket接続成功');
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
    };
    
    socket.onclose = () => {
        console.log('WebSocket切断');
    };
    
    socket.onerror = (error) => {
        console.error('WebSocketエラー:', error);
    };
}

function handleServerMessage(data) {
    switch (data.type) {
        case 'init':
            myId = data.id;
            gameMode = data.gameMode;
            gameStarted = data.gameStarted;
            votingActive = data.votingActive;
            
            if (votingActive) {
                showVotingUI();
            }
            break;
            
        case 'voting_start':
            votingActive = true;
            showVotingUI();
            break;
            
        case 'vote_update':
            // 投票状況を更新
            const voteStatus = document.getElementById('vote-status');
            if (voteStatus) {
                voteStatus.textContent = `投票数: PVP=${data.votes.pvp}, Tag=${data.votes.tag}, Parcour=${data.votes.parcour}`;
            }
            break;
            
        case 'voting_result':
            gameMode = data.mode;
            hideVotingUI();
            
            // モード別の設定
            if (gameMode === 'pvp') {
                // 全プレイヤーに剣を表示
                if (myPlayer.userData.sword) {
                    myPlayer.userData.sword.visible = true;
                }
                for (const pid in players) {
                    if (players[pid].userData.sword) {
                        players[pid].userData.sword.visible = true;
                    }
                }
                showHPUI();
                updateHPUI(10);
            } else {
                hideHPUI();
            }
            break;
            
        case 'game_start':
            gameStarted = true;
            gameMode = data.mode;
            
            if (gameMode === 'pvp') {
                myHP = 10;
                isAlive = true;
                showHPUI();
                updateHPUI(10);
                
                // 障害物を削除（壁は残す）
                removeObstacles();
            }
            break;
            
        case 'pvp_damage':
            if (data.targetId === myId) {
                myHP = data.hp;
                updateHPUI(myHP);
                
                // ノックバック効果
                if (data.knockback) {
                    velocity.y = 5;
                }
            }
            break;
            
        case 'pvp_death':
            if (data.playerId === myId) {
                isAlive = false;
                console.log('あなたは倒されました');
            }
            break;
            
        case 'pvp_winner':
            setTimeout(() => {
                alert(`勝者: ${data.winnerName}`);
            }, 500);
            break;
            
        case 'game_reset':
            gameStarted = false;
            gameMode = null;
            myHP = 10;
            isAlive = true;
            hideHPUI();
            votingActive = false;
            break;
            
        case 'position_update':
            if (data.id !== myId && players[data.id]) {
                players[data.id].position.set(data.x, data.y, data.z);
                players[data.id].rotation.y = data.rotation;
            }
            break;
    }
}

function removeObstacles() {
    // 障害物（建物）を削除する実装
    // この部分は元のコードの建物配置に応じて実装
}

function animate() {
    requestAnimationFrame(animate);
    
    if (gameStarted && isAlive) {
        updateMovement();
    }
    
    // カメラ更新
    camera.quaternion.setFromEuler(new THREE.Euler(rotationX, rotationY, 0, 'YXZ'));
    camera.position.copy(myPlayer.position);
    camera.position.y += 1.7;
    
    renderer.render(scene, camera);
}

function updateMovement() {
    const delta = 0.016; // 約60fps
    
    // 重力
    velocity.y -= 25.0 * delta;
    
    // 移動
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    
    const moveSpeed = 20.0;
    
    if (moveForward || moveBackward) {
        velocity.z -= direction.z * moveSpeed * delta;
    }
    if (moveLeft || moveRight) {
        velocity.x -= direction.x * moveSpeed * delta;
    }
    
    // カメラの向きに応じて移動方向を調整
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);
    forward.applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    right.applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();
    
    const moveDirection = new THREE.Vector3();
    moveDirection.addScaledVector(forward, -velocity.z);
    moveDirection.addScaledVector(right, -velocity.x);
    
    myPlayer.position.add(moveDirection);
    myPlayer.position.y += velocity.y * delta;
    
    // 地面との衝突判定
    if (myPlayer.position.y <= 0) {
        myPlayer.position.y = 0;
        velocity.y = 0;
        canJump = true;
    }
    
    // 壁との衝突判定
    const boundary = 95;
    myPlayer.position.x = Math.max(-boundary, Math.min(boundary, myPlayer.position.x));
    myPlayer.position.z = Math.max(-boundary, Math.min(boundary, myPlayer.position.z));
    
    // 位置をサーバーに送信
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'update_position',
            x: myPlayer.position.x,
            y: myPlayer.position.y,
            z: myPlayer.position.z,
            rotation: camera.rotation.y
        }));
    }
    
    // 速度減衰
    velocity.x *= 0.9;
    velocity.z *= 0.9;
}

// 初期化実行
init();