const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let playerCounter = 0;

// クライアントの静的ファイルをホスティング
app.use(express.static(path.join(__dirname, '')));

// 環境変数PORTを使用。ローカルでは10000を使用
const port = process.env.PORT || 10000;

function broadcast(message) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    });
}

// === 追加するコード ===
// 2秒ごとに全プレイヤーの状態をブロードキャスト
setInterval(() => {
    broadcast({
        type: 'all_player_update',
        players: players
    });
}, 1000); // 2000ミリ秒 = 2秒
// ====================

// WebSocket接続処理
wss.on('connection', ws => {
    const id = `player_${playerCounter++}`;
    players[id] = { id: id, x: 100, y: 100, hp: 100 };
    console.log(`新しいプレイヤーが接続しました: ${id}`);
    
    // 1. 新しいプレイヤーに、既存の全プレイヤー情報を送信
    ws.send(JSON.stringify({ type: 'init', id: id, players: players }));

    // 2. 既存の全プレイヤーに、新しいプレイヤーの参加を通知
    broadcast({ type: 'player_update', id: id, x: players[id].x, y: players[id].y, hp: players[id].hp });
    
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const player = players[data.id];
            
            if (data.type === 'move' && player) {
                player.x = data.x;
                player.y = data.y;
                broadcast(data);
            } else if (data.type === 'attack') {
                const targetId = data.targetId;
                const attackerId = data.attackerId;
                
                if (players[targetId] && players[attackerId]) {
                    const attacker = players[attackerId];
                    const target = players[targetId];

                    const dist = Math.sqrt(
                        Math.pow(attacker.x - target.x, 2) + 
                        Math.pow(attacker.y - target.y, 2)
                    );
                    
                    if (dist < 50) {
                        target.hp -= 10;
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

// サーバーを起動
server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});