const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ws = new WebSocket(`wss://${window.location.host}`);
let players = {};
let myId = null;
let lastMove = {};
let lastSendTime = 0;
const sendInterval = 100;
const PLAYER_SPEED = 5; // プレイヤーの移動速度

const GRAVITY = 0.5;
const JUMP_POWER = -15;
const PLAYER_RADIUS = 15;
const GROUND_Y = canvas.height - 50;

let targetX = null;
let targetY = null;

// 背景を黒にするため、地面の描画を削除
// ctx.fillStyle = '#4a2c09';
// ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') {
        myId = data.id;
        for (const playerId in data.players) {
            players[playerId] = { ...data.players[playerId], dy: 0, onGround: false };
        }
    } else if (data.type === 'player_update') {
        if (!players[data.id]) {
            players[data.id] = { x: data.x, y: data.y, hp: data.hp, dy: 0, onGround: false };
        } else {
            players[data.id].x = data.x;
            players[data.id].y = data.y;
            players[data.id].hp = data.hp;
        }
    } else if (data.type === 'all_player_update') {
        for (const id in data.players) {
            if (!players[id]) {
                players[id] = { ...data.players[id], dy: 0, onGround: false };
            }
        }
        for (const id in players) {
            if (data.players[id]) {
                players[id].x = data.players[id].x;
                players[id].y = data.players[id].y;
                players[id].hp = data.players[id].hp;
            } else if (id !== myId) {
                delete players[id];
            }
        }
    } else if (data.type === 'remove_player') {
        delete players[data.id];
    } else if (data.type === 'hp_update') {
        if (players[data.id]) {
            players[data.id].hp = data.hp;
        }
    } else if (data.type === 'player_died') {
        delete players[data.id];
    }
};

// キーボード操作を削除
// document.addEventListener('keydown', ...);

// クリック/タップで移動先を設定
document.addEventListener('mousedown', e => {
    targetX = e.clientX;
    targetY = e.clientY;
});
document.addEventListener('touchstart', e => {
    targetX = e.touches[0].clientX;
    targetY = e.touches[0].clientY;
});
document.addEventListener('mouseup', () => {
    targetX = null;
    targetY = null;
});
document.addEventListener('touchend', () => {
    targetX = null;
    targetY = null;
});

// ボタン操作を削除
// document.getElementById('move-left').addEventListener('click', ...);
// ...

function attackNearestPlayer() {
    let nearestPlayerId = null;
    let minDistance = Infinity;
    if (!players[myId]) return;
    for (let id in players) {
        if (id != myId) {
            const distance = Math.sqrt(
                Math.pow(players[id].x - players[myId].x, 2) + 
                Math.pow(players[id].y - players[myId].y, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearestPlayerId = id;
            }
        }
    }
    if (nearestPlayerId) {
        ws.send(JSON.stringify({ type: 'attack', targetId: nearestPlayerId, attackerId: myId }));
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景を黒にする
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const player = players[id];

        // 地面と重力のロジックを削除
        // player.dy += GRAVITY;
        // player.y += player.dy;
        // if (player.y + PLAYER_RADIUS >= GROUND_Y) { ... }

        // マウスの座標に向かってプレイヤーを移動
        if (id === myId && targetX !== null && targetY !== null) {
            const dx = targetX - player.x;
            const dy = targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > PLAYER_RADIUS) {
                const angle = Math.atan2(dy, dx);
                player.x += Math.cos(angle) * PLAYER_SPEED;
                player.y += Math.sin(angle) * PLAYER_SPEED;
            }
        }

        // 自身のプレイヤーの状態をサーバーに送信
        if (id === myId && (Date.now() - lastSendTime > sendInterval)) {
            const currentMove = { x: player.x, y: player.y };
            if (JSON.stringify(currentMove) !== JSON.stringify(lastMove)) {
                ws.send(JSON.stringify({
                    type: 'move',
                    id: myId,
                    x: player.x,
                    y: player.y
                }));
                lastMove = currentMove;
                lastSendTime = Date.now();
            }
        }

        // プレイヤーの描画
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = (id === myId) ? 'blue' : 'red';
        ctx.fill();
        ctx.closePath();

        // 目の描画
        ctx.beginPath();
        ctx.arc(player.x + 5, player.y - 5, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(player.x + 5, player.y - 5, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.closePath();

        // HPバーの描画
        ctx.fillStyle = 'black';
        ctx.fillRect(player.x - 15, player.y - 30, 30, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(player.x - 15, player.y - 30, (player.hp / 100) * 30, 5);
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();