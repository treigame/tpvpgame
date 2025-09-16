const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ws = new WebSocket(`wss://${window.location.host}`);
let players = {};
let orbs = [];
let myId = null;
let lastMove = {};
let lastSendTime = 0;
const sendInterval = 50; // 通信間隔を短くしてスムーズに
const PLAYER_SPEED = 5;
const PLAYER_RADIUS = 15;

let targetX = null;
let targetY = null;

ws.onmessage = event => {
    const data = JSON.parse(event.data);
    if (data.type === 'init') {
        myId = data.id;
        for (const playerId in data.players) {
            players[playerId] = { ...data.players[playerId], body: data.players[playerId].body || [] };
        }
        orbs = data.orbs || [];
    } else if (data.type === 'player_update') {
        if (!players[data.id]) {
            players[data.id] = { x: data.x, y: data.y, hp: data.hp, body: [] };
        } else {
            players[data.id].x = data.x;
            players[data.id].y = data.y;
            players[data.id].hp = data.hp;
        }
    } else if (data.type === 'all_player_update') {
        for (const id in data.players) {
            if (!players[id]) {
                players[id] = { ...data.players[id], body: data.players[id].body || [] };
            }
        }
        for (const id in players) {
            if (data.players[id]) {
                players[id].x = data.players[id].x;
                players[id].y = data.players[id].y;
                players[id].body = data.players[id].body;
                players[id].length = data.players[id].length;
            } else if (id !== myId) {
                delete players[id];
            }
        }
        orbs = data.orbs || [];
    } else if (data.type === 'remove_player') {
        delete players[data.id];
    } else if (data.type === 'player_died') {
        if (players[data.id]) {
            // プレイヤーを初期位置にリセット
            players[data.id].x = 100;
            players[data.id].y = 100;
            players[data.id].body = [];
            players[data.id].length = 10;
        }
    } else if (data.type === 'move') {
        if (players[data.id]) {
            players[data.id].x = data.x;
            players[data.id].y = data.y;
            players[data.id].body = data.body;
            players[data.id].length = data.length;
        }
    } else if (data.type === 'orb_eaten') {
        orbs = orbs.filter(orb => orb.id !== data.orbId);
    }
};

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

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景を黒に
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 球を描画
    orbs.forEach(orb => {
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = orb.color;
        ctx.fill();
        ctx.closePath();
    });

    for (let id in players) {
        const player = players[id];

        // マウスの座標に向かってプレイヤーを移動
        if (id === myId && targetX !== null && targetY !== null) {
            const dx = targetX - player.x;
            const dy = targetY - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) {
                const angle = Math.atan2(dy, dx);
                player.x += Math.cos(angle) * PLAYER_SPEED;
                player.y += Math.sin(angle) * PLAYER_SPEED;

                // 自分の体を更新
                player.body.push({ x: player.x, y: player.y });
                while (player.body.length > player.length) {
                    player.body.shift();
                }
            }
        }

        if (id === myId && (Date.now() - lastSendTime > sendInterval)) {
            const currentMove = { x: player.x, y: player.y, body: player.body };
            if (JSON.stringify(currentMove) !== JSON.stringify(lastMove)) {
                ws.send(JSON.stringify({
                    type: 'move',
                    id: myId,
                    x: player.x,
                    y: player.y,
                    body: player.body
                }));
                lastMove = currentMove;
                lastSendTime = Date.now();
            }
        }

        // プレイヤーの体の描画
        if (player.body.length > 0) {
            for (let i = 0; i < player.body.length; i++) {
                const segment = player.body[i];
                ctx.beginPath();
                ctx.arc(segment.x, segment.y, 10, 0, Math.PI * 2);
                ctx.fillStyle = (id === myId) ? 'blue' : 'red';
                ctx.fill();
                ctx.closePath();
            }
        }
    }
    
    requestAnimationFrame(gameLoop);
}

gameLoop();