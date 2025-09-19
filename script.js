import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// WebSocket接続
const ws = new WebSocket(`wss://${window.location.host}`);
let myId = null;
let players = {};
let orbs = {};
let oniId = null;
let isConnected = false;

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
        
        // 初期化時に自分の剣の状態を設定
        if (myId === oniId) {
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
    } else if (data.type === 'oni_changed') {
        const oldOni = oniId;
        oniId = data.oniId;
        console.log(`鬼が交代しました: ${oniId}`);
        
        // 古い鬼から剣を削除
        if (oldOni === myId) {
            removeSword(camera);
        } else if (players[oldOni] && players[oldOni].sword) {
            removeSword(players[oldOni]);
        }
        
        // 新しい鬼に剣を追加
        if (oniId === myId) {
            addSword(camera);
        } else if (players[oniId] && !players[oniId].sword) {
            addSword(players[oniId]);
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // より滑らかな影
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

// 壁の設定（改善された見た目）
const WALL_SIZE = 200;
const WALL_HEIGHT = 20;
const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1
});

const walls = [];

// 4つの壁を作成
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

// プレイヤーメッシュ（改善された見た目）
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

// 剣を追加する関数（改善された見た目）
function addSword(mesh) {
    if (mesh.sword) return; // 既に剣がある場合は追加しない
    
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

// オーブメッシュ（改善された見た目）
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

// PointerLockControls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// プレイヤーの初期位置を設定
controls.getObject().position.set(0, 1.7, 0);

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// ポインターロックの要求
document.addEventListener('click', () => {
    if (!document.pointerLockElement) {
        document.body.requestPointerLock();
    }
});

// キーボードイベント（改善された処理）
const keys = {};

document.addEventListener('keydown', (event) => {
    if (event.repeat) return; // キーリピートを無視
    
    keys[event.code] = true;
    
    switch (event.code) {
        case 'KeyW':
            moveForward = true;
            break;
        case 'KeyA':
            moveLeft = true;
            break;
        case 'KeyS':
            moveBackward = true;
            break;
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            event.preventDefault();
            if (canJump) {
                velocity.y += 12;
                canJump = false;
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
const POSITION_SEND_INTERVAL = 50; // 50ms間隔で送信
const POSITION_THRESHOLD = 0.1; // 0.1ユニット以上移動した場合のみ送信

function sendPositionUpdate() {
    if (!isConnected || !myId) return;
    
    const currentTime = performance.now();
    const currentPosition = controls.getObject().position;
    
    // 時間間隔と移動距離の両方をチェック
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

// アニメーションループ（改善された物理演算）
let prevTime = performance.now();
const playerCollider = new THREE.Box3();
const wallCollider = new THREE.Box3();

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 1/30); // デルタタイムの制限

    // 摩擦力の適用
    velocity.x *= Math.pow(0.1, delta);
    velocity.z *= Math.pow(0.1, delta);
    
    // 重力の適用
    velocity.y -= 9.8 * 15.0 * delta;

    // 入力方向の計算
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    // 移動速度の適用
    const moveSpeed = 300.0;
    if (moveForward || moveBackward) velocity.z -= direction.z * moveSpeed * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta;
    
    // 衝突判定用の前の位置を保存
    const prevPosition = controls.getObject().position.clone();
    
    // 位置の更新
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);
    controls.getObject().position.y += velocity.y * delta;
    
    // 壁との衝突判定
    const playerRadius = 1.0;
    const playerPos = controls.getObject().position;
    
    // より正確な衝突判定
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
        }
    }

    // オーブの回転アニメーション
    for (const id in orbs) {
        orbs[id].rotation.y += delta * 2;
        orbs[id].position.y = 0.5 + Math.sin(time * 0.003 + parseFloat(id.slice(4)) * 0.5) * 0.3;
    }

    // 位置情報の送信
    sendPositionUpdate();

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

// 鬼ごっこの判定（改善された処理）
setInterval(() => {
    if (!isConnected || myId !== oniId) return;
    
    for (const id in players) {
        if (id === myId) continue;
        const otherPlayer = players[id];
        const distance = controls.getObject().position.distanceTo(otherPlayer.position);
        if (distance < 2.5) {
            ws.send(JSON.stringify({ 
                type: 'tag_player', 
                id: myId, // 送信者IDを明示的に設定
                taggedId: id 
            }));
            break;
        }
    }
}, 300); // より頻繁にチェック