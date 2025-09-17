const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let playerCounter = 0;
let orbs = [];
const ORB_COUNT = 50;

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
    orbs = [];
    for (let i = 0; i < ORB_COUNT; i++) {
        orbs.push({
            id: `orb_${i}`,
            x: Math.random() * 800,
            y: Math.random() * 600,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`
        });
    }
}
generateOrbs();

setInterval(() => {
    broadcast({
        type: 'all_player_update',
        players: players,
        orbs: orbs
    });
}, 2000);

wss.on('connection', ws => {
    let playerId = null;

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            
            // ログイン処理
            if (data.type === 'login') {
                playerId = data.username;
                if (!players[playerId]) {
                    players[playerId] = { id: playerId, x: 100, y: 100, body: [], hp: 100, length: 10 };
                }
                console.log(`Player logged in: ${playerId}`);
                ws.send(JSON.stringify({ type: 'init', id: playerId, players: players, orbs: orbs }));
                broadcast({ type: 'player_update', id: playerId, x: players[playerId].x, y: players[playerId].y, hp: players[playerId].hp });
            }
            
            if (!playerId) return;
            
            const player = players[playerId];
            if (data.type === 'move' && player) {
                player.x = data.x;
                player.y = data.y;
                player.body = data.body;
                
                for (let otherId in players) {
                    if (otherId === playerId) continue;
                    
                    const otherPlayer = players[otherId];
                    if (otherPlayer.body.length > 5) {
                         for(let i = 5; i < otherPlayer.body.length; i++) {
                             const segment = otherPlayer.body[i];
                             const dist = Math.sqrt(
                                 Math.pow(player.x - segment.x, 2) + 
                                 Math.pow(player.y - segment.y, 2)
                             );
                             if (dist < 10) {
                                 console.log(`Player ${playerId} died by Player ${otherId}.`);
                                 
                                 if (player.body.length > 10) {
                                    for(let j = 0; j < player.length / 5; j++) {
                                       orbs.push({
                                           id: `orb_${orbs.length}_${Date.now()}`,
                                           x: player.body[Math.floor(Math.random() * player.body.length)].x,
                                           y: player.body[Math.floor(Math.random() * player.body.length)].y,
                                           color: `hsl(${Math.random() * 360}, 100%, 50%)`
                                       });
                                    }
                                 }

                                 player.x = 100 + Math.random() * 50;
                                 player.y = 100 + Math.random() * 50;
                                 player.body = [];
                                 player.length = 10;
                                 
                                 broadcast({ type: 'player_died', id: playerId });
                                 broadcast({ type: 'all_player_update', players: players, orbs: orbs });
                                 
                                 return;
                             }
                         }
                    }
                }

                for (let i = orbs.length - 1; i >= 0; i--) {
                    const orb = orbs[i];
                    const dist = Math.sqrt(
                        Math.pow(player.x - orb.x, 2) + 
                        Math.pow(player.y - orb.y, 2)
                    );
                    if (dist < 10) {
                        player.length += 1;
                        orbs.splice(i, 1);
                        broadcast({ type: 'orb_eaten', id: playerId, orbId: orb.id });
                    }
                }
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    ws.on('close', () => {
        if (playerId) {
            console.log(`プレイヤーが切断しました: ${playerId}`);
            delete players[playerId];
            broadcast({ type: 'remove_player', id: playerId });
        }
    });
});

server.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました。`);
});