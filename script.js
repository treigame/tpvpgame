const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ws = new WebSocket('wss://tpvpgame-2.onrender.com');

let players = {};
let myId = null;
let lastMove = {};
let lastSendTime = 0;
const sendInterval = 100; // 100ミリ秒ごとに送信（1秒間に10回）

// ✨ 新しい物理定数
const GRAVITY = 0.5;
const JUMP_POWER = -15;
const PLAYER_RADIUS = 15;
const GROUND_Y = canvas.height - 50;
const SLIDE_FRICTION = 0.98;
const NORMAL_FRICTION = 0.8;

// プラットフォームの定義
const platforms = [
    { x: 100, y: canvas.height - 150, width: 200, height: 20, type: 'normal' },
    { x: 400, y: canvas.height - 250, width: 150, height: 20, type: 'slide' },
    { x: 700, y: canvas.height - 350, width: 150, height: 20, type: 'gravity-flip' }
];

// ジョイスティックの要素を取得
const joystickBase = document.getElementById('joystick-base');
const joystickHandle = document.getElementById('joystick-handle');
let isDragging = false;
let joystickCenter = { x: 0, y: 0 };
let joystickMoveX = 0;

// WebSocketからのメッセージ受信
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

// キーボード操作
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
    
    // 攻撃機能は削除
    
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

// ボタン操作
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
            y: players[id].y
        }));
    }
});

document.getElementById('move-up').addEventListener('click', () => {
    if (myId !== null && players[myId] && players[myId].onGround) {
        players[myId].dy = JUMP_POWER;
        players[myId].onGround = false;
    }
});

// 攻撃ボタンは削除
if (document.getElementById('attack')) {
    document.getElementById('attack').style.display = 'none';
}


// ジョイスティックのイベントリスナー
if (joystickHandle) {
    joystickHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        joystickCenter = {
            x: joystickHandle.getBoundingClientRect().left + joystickHandle.offsetWidth / 2,
            y: joystickHandle.getBoundingClientRect().top + joystickHandle.offsetHeight / 2
        };
    });
}
document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - joystickCenter.x;
    const maxMove = joystickBase.offsetWidth / 2;
    const moveX = Math.max(-maxMove, Math.min(maxMove, dx));
    
    joystickHandle.style.left = `${moveX + maxMove}px`;
    joystickMoveX = moveX / maxMove;
});
document.addEventListener('mouseup', () => {
    isDragging = false;
    joystickMoveX = 0;
    joystickHandle.style.left = '50%';
});


function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 地面を描画
    ctx.fillStyle = '#4a2c09';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);

    // プラットフォームを描画
    platforms.forEach(p => {
        if (p.type === 'normal') {
            ctx.fillStyle = '#6a4a2a';
        } else if (p.type === 'slide') {
            ctx.fillStyle = '#ADD8E6'; // 明るい青
        } else if (p.type === 'gravity-flip') {
            ctx.fillStyle = '#800080'; // 紫色
        }
        ctx.fillRect(p.x, p.y, p.width, p.height);
    });

    for (let id in players) {
        const player = players[id];
        
        // プレイヤーの動きを適用
        if (id == myId) {
            // ジョイスティックからの入力を適用
            const moveSpeed = 5;
            player.x += joystickMoveX * moveSpeed;
        }

        // 物理演算
        player.dy += GRAVITY;
        player.y += player.dy;

        // プラットフォームとの衝突判定
        let onPlatform = false;
        platforms.forEach(p => {
            if (
                player.x > p.x &&
                player.x < p.x + p.width &&
                player.y + PLAYER_RADIUS >= p.y &&
                player.y + PLAYER_RADIUS <= p.y + p.height + player.dy &&
                player.dy >= 0
            ) {
                player.y = p.y - PLAYER_RADIUS;
                player.dy = 0;
                onPlatform = true;

                if (p.type === 'slide') {
                    player.x += joystickMoveX * 2; // 滑る床では横移動が速くなる
                } else if (p.type === 'gravity-flip') {
                    player.dy = -JUMP_POWER * 1.5; // より高くジャンプ
                }
            }
        });

        // 地面との衝突判定
        if (!onPlatform && player.y + PLAYER_RADIUS >= GROUND_Y) {
            player.y = GROUND_Y - PLAYER_RADIUS;
            player.dy = 0;
            player.onGround = true;
        } else if (onPlatform) {
            player.onGround = true;
        } else {
            player.onGround = false;
        }

        // 最後の送信からsendInterval以上経過した場合のみ送信
        if (id == myId && (Date.now() - lastSendTime > sendInterval || player.onGround)) {
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
        
        // プレイヤーを描画
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = (id == myId) ? 'blue' : 'red';
        ctx.fill();
        ctx.closePath();

        // 目を描画（省略）
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
        
        // HPバーを描画
        ctx.fillStyle = 'black';
        ctx.fillRect(player.x - 15, player.y - 30, 30, 5);
        ctx.fillStyle = 'lime';
        ctx.fillRect(player.x - 15, player.y - 30, (player.hp / 100) * 30, 5);
    }
    requestAnimationFrame(gameLoop);
}

gameLoop();