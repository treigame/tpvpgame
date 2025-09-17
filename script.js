import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// WebSocket接続
const ws = new WebSocket(`wss://${window.location.host}`);
let myId = null;
let players = {};
let orbs = {};
let oniId = null;

ws.onopen = () => {
    console.log('WebSocket接続が確立されました。');
    // 接続時にサーバーにIDを要求
    ws.send(JSON.stringify({ type: 'get_id' }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.id;
        oniId = data.oniId;
        console.log(`割り当てられたID: ${myId}`);
        
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
        
        // 旧鬼の剣を削除
        if (oldOni === myId && camera.sword) {
            removeSword(camera);
        } else if (players[oldOni] && players[oldOni].sword) {
            removeSword(players[oldOni]);
        }
        
        // 新鬼に剣を追加
        if (oniId === myId) {
            if (!camera.sword) {
                addSword(camera);
            }
        } else if (players[oniId]) {
            if (!players[oniId].sword) {
                addSword(players[oniId]);
            }
        }
    }
};

ws.onclose = () => {
    console.log('WebSocket接続が切断されました。');
};

// Three.jsシーンのセットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 地面
const planeGeometry = new THREE.PlaneGeometry(200, 200);
const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = Math.PI / 2;
plane.position.y = -1;
scene.add(plane);

// 光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

// プレイヤーメッシュ
function createPlayerMesh(id, data) {
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    players[id] = mesh;
    
    if (id === oniId) {
        addSword(mesh);
    }
}

// 剣を追加する関数
function addSword(mesh) {
    const swordGeometry = new THREE.BoxGeometry(0.2, 0.2, 2);
    const swordMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
    const sword = new THREE.Mesh(swordGeometry, swordMaterial);
    
    // プレイヤーから見て右側に配置
    sword.position.set(1.5, -0.5, -2);
    
    mesh.add(sword);
    mesh.sword = sword;
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
    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.x, data.y, data.z);
    scene.add(mesh);
    orbs[id] = mesh;
}

// PointerLockControls
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// 自動でゲームを開始
document.body.requestPointerLock();
// 鬼の場合は剣を表示
if (myId === oniId) {
    addSword(camera);
}

// キーボードイベント
document.addEventListener('keydown', (event) => {
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
            if (canJump === true) velocity.y += 10;
            canJump = false;
            break;
    }
});

document.addEventListener('keyup', (event) => {
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

// アニメーションループ
let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 10.0 * delta; // 重力

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;
    
    controls.moveRight(velocity.x * delta);
    controls.moveForward(velocity.z * delta);
    controls.getObject().position.y += velocity.y * delta;
    
    if (controls.getObject().position.y < 1.7) {
        velocity.y = 0;
        controls.getObject().position.y = 1.7;
        canJump = true;
    }

    // オーブとの衝突判定
    for (const id in orbs) {
        const orb = orbs[id];
        const distance = controls.getObject().position.distanceTo(orb.position);
        if (distance < 1) {
            ws.send(JSON.stringify({ type: 'eat_orb', orbId: id }));
        }
    }

    renderer.render(scene, camera);
    prevTime = time;
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 鬼ごっこ：プレイヤーに触れると鬼が交代
setInterval(() => {
    if (myId === oniId) {
        for (const id in players) {
            if (id === myId) continue;
            const otherPlayer = players[id];
            const distance = controls.getObject().position.distanceTo(otherPlayer.position);
            if (distance < 2) {
                ws.send(JSON.stringify({ type: 'tag_player', taggedId: id }));
                break;
            }
        }
    }
}, 500); // 0.5秒ごとに衝突判定