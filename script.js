import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// DOM要素の取得
const overlay = document.getElementById('overlay');
const container = document.body;

// WebSocket接続
const ws = new WebSocket(`wss://${window.location.host}`);
let myId = null;
let players = {};
let orbs = {};
let oniId = null;

ws.onopen = () => {
    console.log('WebSocket接続が確立されました。');
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
        oniId = data.oniId;
        for (const id in players) {
            if (id === oniId) {
                if (!players[id].sword) {
                    addSword(players[id]);
                }
            } else {
                if (players[id].sword) {
                    removeSword(players[id]);
                }
            }
        }
        if (oniId === myId) {
            if (!camera.sword) {
                addSword(camera);
            }
        } else {
            if (camera.sword) {
                removeSword(camera);
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
container.appendChild(renderer.domElement);

// 地面
const planeGeometry = new THREE.PlaneGeometry(200, 200);
const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = Math.PI / 2;
plane.position.y = -1; // プレイヤーの足元に合わせる
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
    
    // 鬼であれば剣を追加
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

// PointerLockControls（一人称視点）
const controls = new PointerLockControls(camera, container);
scene.add(controls.getObject());

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// タッチデバイス判定
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// PCとタブレットで異なる操作を定義
if (isTouchDevice) {
    overlay.textContent = "Touch to Play";
    // タッチイベントでゲームを開始
    container.addEventListener('touchstart', (e) => {
        if (e.target === overlay) {
            overlay.style.display = 'none';
            container.requestPointerLock = container.requestPointerLock || container.mozRequestPointerLock;
            container.requestFullscreen();
        }
    });

    // タッチで視点変更（縦横のみ）
    let isTouchLooking = false;
    let prevTouchX = 0;
    let prevTouchY = 0;
    container.addEventListener('touchstart', (e) => {
        isTouchLooking = true;
        prevTouchX = e.touches[0].clientX;
        prevTouchY = e.touches[0].clientY;
        e.preventDefault();
    });

    container.addEventListener('touchmove', (e) => {
        if (!isTouchLooking) return;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;

        const dx = touchX - prevTouchX;
        const dy = touchY - prevTouchY;

        // 視点を回転させる (Y軸とX軸のみ)
        controls.getObject().rotation.y -= dx * 0.005;
        controls.getObject().rotation.x -= dy * 0.005;

        // 視点の制限
        const PI_2 = Math.PI / 2;
        controls.getObject().rotation.x = Math.max(-PI_2, Math.min(PI_2, controls.getObject().rotation.x));
        
        prevTouchX = touchX;
        prevTouchY = touchY;

        e.preventDefault();
    });

    container.addEventListener('touchend', () => {
        isTouchLooking = false;
    });

    // ジャンプ機能
    container.addEventListener('touchend', (e) => {
        if (canJump) {
            velocity.y += 10;
            canJump = false;
        }
    });

    // タブレットではジョイスティックは使わないので、キーボード入力を模倣
    // ここでは単純な移動だけを行う
    // 実際にジョイスティックを実装する場合は、この部分を変更します
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW':
            case 'KeyA':
            case 'KeyS':
            case 'KeyD':
                // タッチデバイスではキーボードは使わない
                break;
        }
    });
} else {
    // PC (マウスとキーボード)
    overlay.textContent = "Click to Play";
    overlay.addEventListener('click', () => {
        controls.lock();
    });
    
    // キーボードイベント
    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'KeyW':
                moveForward = true;
                break;
            case 'KeyA':
                moveRight = true;
                break;
            case 'KeyS':
                moveBackward = true;
                break;
            case 'KeyD':
                moveLeft = true;
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
                moveRight = false;
                break;
            case 'KeyS':
                moveBackward = false;
                break;
            case 'KeyD':
                moveLeft = false;
                break;
        }
    });
}

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
    
    // 地面との接触判定
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

// マウスクリックまたはタッチで鬼の交代をリクエスト
const raycaster = new THREE.Raycaster();
container.addEventListener('mousedown', (event) => {
    // 鬼でなければ何もしない
    if (myId !== oniId) return;

    // ポインターがロックされている場合のみ処理
    if (!controls.isLocked) return;
    
    // 画面中央からレイを飛ばす
    const mouse = new THREE.Vector2(0, 0);
    raycaster.setFromCamera(mouse, camera);
    
    const interactablePlayers = [];
    for(const id in players) {
        if(id !== myId) {
            interactablePlayers.push(players[id]);
        }
    }
    
    const intersects = raycaster.intersectObjects(interactablePlayers);
    
    if (intersects.length > 0) {
        const taggedPlayerMesh = intersects[0].object;
        let taggedPlayerId = null;
        for(const id in players) {
            if (players[id] === taggedPlayerMesh) {
                taggedPlayerId = id;
                break;
            }
        }
        
        if (taggedPlayerId) {
            ws.send(JSON.stringify({ type: 'tag_player', taggedId: taggedPlayerId }));
        }
    }
});