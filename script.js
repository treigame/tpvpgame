import * as THREE from 'three';

// シーン、カメラ、レンダラーのセットアップ
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 地面を作成
const planeGeometry = new THREE.PlaneGeometry(100, 100);
const planeMaterial = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = Math.PI / 2;
scene.add(plane);

// プレイヤー（青い球体）を作成
const playerGeometry = new THREE.SphereGeometry(1, 32, 32);
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 1;
scene.add(player);

// オーブ（赤い球体）を作成
const orbs = [];
const ORB_COUNT = 50;
const orbGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

for (let i = 0; i < ORB_COUNT; i++) {
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    orb.position.x = Math.random() * 80 - 40;
    orb.position.z = Math.random() * 80 - 40;
    orb.position.y = 0.5;
    scene.add(orb);
    orbs.push(orb);
}

// 光源を追加
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// カメラの位置を調整
camera.position.set(0, 20, 30);
camera.lookAt(new THREE.Vector3(0, 0, 0));

// マウスイベントを処理するための変数
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

window.addEventListener('mousemove', (event) => {
    // マウス位置を正規化
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// ゲームループ
function animate() {
    requestAnimationFrame(animate);

    // レイキャスターを更新
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(plane);
    if (intersects.length > 0) {
        const targetPoint = intersects[0].point;
        // プレイヤーの新しい位置を計算
        player.position.x += (targetPoint.x - player.position.x) * 0.05;
        player.position.z += (targetPoint.z - player.position.z) * 0.05;
    }

    // 衝突判定
    orbs.forEach(orb => {
        const distance = player.position.distanceTo(orb.position);
        if (distance < 1.5) {
            orb.visible = false;
        }
    });

    renderer.render(scene, camera);
}
animate();

// ウィンドウサイズ変更時の処理
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});