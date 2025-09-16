const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// 💡 サーバーのURLを必ずあなたのものに合わせる
const ws = new WebSocket('wss://tpvpgame-2.onrender.com/'); 

let players = {};
let myId = null;
let lastMove = {};
let lastSendTime = 0;
const sendInterval = 100;

const GRAVITY = 0.5;
const JUMP_POWER = -15;
const PLAYER_RADIUS = 15;
const GROUND_Y = canvas.height - 50;

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

document.addEventListener('keydown', e => {
    if (myId === null || !players[myId]) return;
    let moveX = 0;
    let myPlayer = players[myId];
    if (e.key === 'a') moveX = -5;
    if (e.key === 'd') moveX = 5;
    if (e.key === 'w' || e.key === 'W') {
        if (myPlayer.onGround) {
            myPlayer.dy = JUMP_POWER;
            myPlayer.onGround = false;
        }
    }
    if (e.key === ' ') {
        attackNearestPlayer();
    }
    if (moveX !== 0) {
        myPlayer.x += moveX;
        ws.send(JSON.stringify({
            type: 'move',
            id: myId,
            x: myPlayer.x,
            y: myPlayer.y
        }));
    }
});

document.getElementById('move-left').addEventListener('click', () => {
    if (myId !== null && players[myId]) {
        players[myId].x -= 5;
        ws.send(JSON.stringify({
            type: 'move',
            id: myId,
            x: players[myId].x,
            y: players[myId].y
        }));
    }
});

document.getElementById('move-right').addEventListener('click', () => {
    if (myId !== null && players[myId]) {
        players[myId].x += 5;
        ws.send(JSON.stringify({
            type: 'move',
            id: myId,
            x: players[myId].x,
            y: players[myId].y
        }));
    }
});

document.getElementById('move-up').addEventListener('click', () => {
    if (myId !== null && players[myId] && players[myId].onGround) {
        players[myId].dy = JUMP_POWER;
        players[myId].onGround = false;
    }
});

document.getElementById('attack').addEventListener('click', () => {
    attackNearestPlayer();
});

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
    ctx.fillStyle = '#4a2c09';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    for (let id in players) {
        const player = players[id];
        player.dy += GRAVITY;
        player.y += player.dy;
        if (player.y + PLAYER_RADIUS >= GROUND_Y) {
            player.y = GROUND_Y - PLAYER_RADIUS;
            player.dy = 0;
            player.onGround = true;
        } else {
            player.onGround = false;
        }
        if (id === myId && (Date.now() - lastSendTime > sendInterval || player.onGround)) {
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
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = (id === myId) ? 'blue' : 'red';
        ctx.fill();
        ctx.closePath();
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
        ctx.fillStyle = 'black';
        ctx.fillRect(player.x - 15, player.y - 30, 30, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(player.x - 15, player.y - 30, (player.hp / 100) * 30, 5);
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();