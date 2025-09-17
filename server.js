const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let orbs = {};
let oniId = null;
const ORB_COUNT = 50;
let playerCounter = 0;

app.use(express.static(path.join(__dirname, '')));

const port = process.env.PORT || 10000;

function broadcast(message) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    });
}

function generateOrbs() {
    orbs = {};
    for (let i = 0; i < ORB_COUNT; i++) {
        const orbId = `orb_${i}`;
        orbs[orbId] = {
            id: orbId,
            x: Math.random() * 80 - 40,
            y: 0.5,
            z: Math.random() * 80 - 40,
        };
    }
}
generateOrbs();

wss.on('connection', ws => {
    const id = `player_${playerCounter++}`;
    players[id] = { id: id, x: 0, y: 1.7, z: 0 };
    console.log(`新しいプレイヤーが接続しました: ${id}`);
    
    if (!oniId) {
        oniId = id;
    }
    
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'get_id') {
                ws.send(JSON.stringify({ type: 'init', id: id, players: players, orbs: orbs, oniId: oniId }));
                // 新しいプレイヤーの情報を他のプレイヤーにブロードキャスト
                broadcast({ type: 'player_update', id: id, x: players[id].x, y: players[id].y, z: players[id].z });
            } else if (data.type === 'move') {
                const player = players[data.id];
                if (player) {
                    player.x = data.x;
                    player.y = data.y;
                    player.z = data.z;
                    
                    broadcast({ type: 'player_update', id: data.id, x: player.x, y: player.y, z: player.z });
                }
            } else if (data.type === 'eat_orb') {
                if (orbs[data.orbId]) {
                    delete orbs[data.orbId];
                    broadcast({ type: 'orb_eaten', orbId: data.orbId });
                }
            } else if (data.type === 'tag_player') {
                if (data.id === oniId) {
                    oniId = data.taggedId;
                    broadcast({ type: 'oni_changed', oniId: oniId });
                    console.log(`鬼が交代しました: ${oniId}`);
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
        
        if (id === oniId) {
            const playerIds = Object.keys(players);
            if (playerIds.length > 0) {
                oniId = playerIds[Math.floor(Math.random() * playerIds.length)];
                broadcast({ type: 'oni_changed', oniId: oniId });
                console.log(`鬼が切断しました。新しい鬼は: ${oniId}`);
            } else {
                oniId = null;
            }
        }
    });
});

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});