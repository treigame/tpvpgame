const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

let players = {};
let playerCounter = 0;

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
    players[id] = { id: id, x: 100, y: 100, hp: 100 };
    console.log(`新しいプレイヤーが接続しました: ${id}`);

    // 新しいプレイヤーに初期情報を送信
    ws.send(JSON.stringify({ type: 'init', id: id, players: players }));

    // 他の全プレイヤーに新しいプレイヤーの情報を送信
    broadcast({ type: 'player_update', id: id, x: players[id].x, y: players[id].y, hp: players[id].hp });

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const player = players[data.id];

            if (data.type === 'move' && player) {
                // クライアントからの移動情報を受信し、プレイヤーの位置を更新
                player.x = data.x;
                player.y = data.y;
                
                // 他のプレイヤーに位置情報を送信
                broadcast(data);
            } else if (data.type === 'attack') {
                const targetId = data.targetId;
                const attackerId = data.attackerId; // 攻撃者のIDも受け取る

                if (players[targetId] && players[attackerId]) {
                    // 攻撃者の情報に基づいて攻撃を処理
                    const attacker = players[attackerId];
                    const target = players[targetId];

                    // 攻撃範囲のチェック（サーバー側でも基本的なチェックを行う）
                    const dist = Math.sqrt(
                        Math.pow(attacker.x - target.x, 2) + 
                        Math.pow(attacker.y - target.y, 2)
                    );

                    if (dist < 50) { // 例: 攻撃範囲50ピクセル
                        target.hp -= 10; // HPを減少
                        console.log(`Player ${attackerId} attacked Player ${targetId}. HP: ${target.hp}`);

                        if (target.hp <= 0) {
                            delete players[targetId];
                            broadcast({ type: 'player_died', id: targetId });
                            console.log(`Player ${targetId} died.`);
                        } else {
                            broadcast({ type: 'hp_update', id: targetId, hp: target.hp });
                        }
                    }
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