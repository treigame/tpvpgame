const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });

let players = {};
let playerCounter = 0;

// 新しい物理定数とプラットフォームの定義
const GRAVITY = 0.5;
const JUMP_POWER = -15;
const PLAYER_RADIUS = 15;
const GROUND_Y = 500;
const platforms = [
    { x: 100, y: GROUND_Y - 150, width: 200, height: 20, type: 'normal' },
    { x: 400, y: GROUND_Y - 250, width: 150, height: 20, type: 'slide' },
    { x: 700, y: GROUND_Y - 350, width: 150, height: 20, type: 'gravity-flip' }
];

// ゲームの更新ループ (サーバーで物理演算を実行)
setInterval(() => {
    for (const id in players) {
        const player = players[id];
        
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
                player.y + PLAYER_RADIUS <= p.y + p.height &&
                player.dy >= 0
            ) {
                player.y = p.y - PLAYER_RADIUS;
                player.dy = 0;
                onPlatform = true;
                if (p.type === 'gravity-flip') {
                    player.dy = -JUMP_POWER * 1.5;
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
    }
}, 1000 / 60);

// クライアントへの定期的なブロードキャスト
setInterval(() => {
    broadcast({ type: 'players_update', players: players });
}, 1000 / 30); // 1秒間に30回、プレイヤー情報を送信

function broadcast(message) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    });
}

wss.on('connection', ws => {
    const id = `player_${playerCounter++}`;
    players[id] = { id: id, x: 100, y: 100, hp: 100, dy: 0, onGround: false };
    console.log(`新しいプレイヤーが接続しました: ${id}`);

    // 新しいプレイヤーに初期情報を送信
    ws.send(JSON.stringify({ type: 'init', id: id, players: players }));

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const player = players[data.id];
            if (!player) return;

            if (data.type === 'move') {
                // クライアントからの入力（X座標の変更）をサーバーのプレイヤーに反映
                const moveSpeed = 5;
                if (data.direction === 'left') player.x -= moveSpeed;
                if (data.direction === 'right') player.x += moveSpeed;
            } else if (data.type === 'jump') {
                // クライアントからのジャンプメッセージを受け取る
                if (player.onGround) {
                    player.dy = JUMP_POWER;
                    player.onGround = false;
                }
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    ws.on('close', () => {
        console.log(`プレイヤーが切断しました: ${id}`);
        delete players[id];
        broadcast({ type: 'remove_player', id: id });
    });
});