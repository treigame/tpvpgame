const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let redItems = {};
let snowballs = {};
let playerRanks = {};
let oniId = null;
const RED_ITEM_COUNT = 25;
let playerCounter = 0;
let snowballCounter = 0;

// ゲームモード関連
let gameMode = null; // 'pvp', 'tag', 'parcour'
let votingActive = false;
let votes = { pvp: 0, tag: 0, parcour: 0 };
let votedPlayers = new Set();

let gameStarted = false;
let waitingForPlayers = false;
let countdownInterval = null;
let gameTimerInterval = null;
const MIN_PLAYERS = 3;
const GAME_TIME_LIMIT = 240;

let gameStats = {
    totalGames: 0,
    totalOniChanges: 0,
    totalSnowballsThrown: 0,
    totalItemsCollected: 0,
    startTime: Date.now()
};

function isValidPosition(x, y, z) {
    const BOUNDARY = 95;
    return x >= -BOUNDARY && x <= BOUNDARY && 
           z >= -BOUNDARY && z <= BOUNDARY && 
           y >= 0 && y <= 50;
}

app.use(express.static(path.join(__dirname, '')));

const port = process.env.PORT || 10000;

const buildingPositions = [
    { pos: [0, 4, 0], size: [12, 8, 12] },
    { pos: [20, 3, 20], size: [8, 6, 8] },
    { pos: [-20, 3, 20], size: [8, 6, 8] },
    { pos: [20, 3, -20], size: [8, 6, 8] },
    { pos: [-20, 3, -20], size: [8, 6, 8] },
    { pos: [0, 3, 60], size: [15, 6, 10] },
    { pos: [30, 3, 70], size: [10, 8, 10] },
    { pos: [-30, 3, 70], size: [10, 8, 10] },
    { pos: [0, 3, -60], size: [15, 6, 10] },
    { pos: [40, 3, -65], size: [8, 10, 8] },
    { pos: [-40, 3, -65], size: [8, 10, 8] },
    { pos: [70, 3, 0], size: [10, 6, 20] },
    { pos: [60, 3, 30], size: [12, 5, 8] },
    { pos: [60, 3, -30], size: [12, 5, 8] },
    { pos: [-70, 3, 0], size: [10, 6, 20] },
    { pos: [-60, 3, 30], size: [12, 5, 8] },
    { pos: [-60, 3, -30], size: [12, 5, 8] },
    { pos: [45, 2, 45], size: [6, 4, 6] },
    { pos: [55, 2, 35], size: [6, 4, 6] },
    { pos: [35, 2, 55], size: [6, 4, 6] },
    { pos: [-45, 2, 45], size: [6, 4, 6] },
    { pos: [-55, 2, 35], size: [6, 4, 6] },
    { pos: [-35, 2, 55], size: [6, 4, 6] },
    { pos: [45, 2, -45], size: [6, 4, 6] },
    { pos: [55, 2, -35], size: [6, 4, 6] },
    { pos: [35, 2, -55], size: [6, 4, 6] },
    { pos: [-45, 2, -45], size: [6, 4, 6] },
    { pos: [-55, 2, -35], size: [6, 4, 6] },
    { pos: [-35, 2, -55], size: [6, 4, 6] },
    { pos: [0, 6, 40], size: [8, 12, 8] },
    { pos: [0, 6, -40], size: [8, 12, 8] },
];

function isPositionInBlock(x, z, y = 1.7) {
    for (const building of buildingPositions) {
        const [bx, by, bz] = building.pos;
        const [w, h, d] = building.size;
        
        if (x >= bx - w/2 && x <= bx + w/2 &&
            z >= bz - d/2 && z <= bz + d/2 &&
            y >= by - h/2 && y <= by + h/2) {
            return true;
        }
    }
    return false;
}

function generateSafePosition() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
        const x = (Math.random() - 0.5) * 180;
        const z = (Math.random() - 0.5) * 180;
        
        if (!isPositionInBlock(x, z)) {
            return { x, z };
        }
        attempts++;
    }
    
    return { x: 0, z: 0 };
}

function broadcast(message, excludeId = null) {
    const jsonMessage = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.playerId !== excludeId) {
            try {
                client.send(jsonMessage);
            } catch (error) {
                console.error(`プレイヤー ${client.playerId} への送信に失敗:`, error);
            }
        }
    });
}

function sendToPlayer(playerId, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.playerId === playerId) {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                console.error(`プレイヤー ${playerId} への送信に失敗:`, error);
            }
        }
    });
}

function generateRedItems() {
    redItems = {};
    console.log('赤いアイテム生成開始...');
    
    const itemZones = [
        { center: [0, 0], radius: 25, count: 5 },
        { center: [40, 40], radius: 20, count: 3 },
        { center: [-40, 40], radius: 20, count: 3 },
        { center: [40, -40], radius: 20, count: 3 },
        { center: [-40, -40], radius: 20, count: 3 },
        { center: [0, 70], radius: 15, count: 2 },
        { center: [0, -70], radius: 15, count: 2 },
        { center: [70, 0], radius: 15, count: 2 },
        { center: [-70, 0], radius: 15, count: 2 },
    ];
    
    let itemCounter = 0;
    
    for (const zone of itemZones) {
        for (let i = 0; i < zone.count; i++) {
            let attempts = 0;
            let position;
            
            do {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * zone.radius;
                position = {
                    x: zone.center[0] + Math.cos(angle) * distance,
                    z: zone.center[1] + Math.sin(angle) * distance
                };
                attempts++;
            } while (isPositionInBlock(position.x, position.z) && attempts < 20);
            
            if (attempts >= 20) {
                position = generateSafePosition();
            }
            
            const itemId = `red_item_${itemCounter++}`;
            redItems[itemId] = {
                id: itemId,
                x: position.x,
                y: 2.0,
                z: position.z,
                zone: zone.center
            };
        }
    }
    
    console.log(`赤いアイテム生成完了: ${Object.keys(redItems).length}個`);
}

generateRedItems();

// 投票システム
function startVoting() {
    if (votingActive) return;
    
    votingActive = true;
    votes = { pvp: 0, tag: 0, parcour: 0 };
    votedPlayers.clear();
    
    console.log('📊 投票開始！');
    broadcast({
        type: 'voting_start',
        message: 'ゲームモードを投票してください！'
    });
}

function processVote(playerId, mode) {
    if (!votingActive || votedPlayers.has(playerId)) {
        return false;
    }
    
    if (['pvp', 'tag', 'parcour'].includes(mode)) {
        votes[mode]++;
        votedPlayers.add(playerId);
        
        console.log(`🗳️ プレイヤー ${playerId} が ${mode} に投票`);
        console.log(`現在の投票数: PVP=${votes.pvp}, Tag=${votes.tag}, Parcour=${votes.parcour}`);
        
        broadcast({
            type: 'vote_update',
            votes: votes,
            totalVotes: votedPlayers.size,
            requiredVotes: MIN_PLAYERS
        });
        
        // 全員が投票したら結果を集計
        if (votedPlayers.size >= MIN_PLAYERS) {
            finalizeVoting();
        }
        
        return true;
    }
    
    return false;
}

function finalizeVoting() {
    votingActive = false;
    
    // 最多得票のモードを決定
    let maxVotes = 0;
    let selectedMode = 'tag';
    
    for (const [mode, count] of Object.entries(votes)) {
        if (count > maxVotes) {
            maxVotes = count;
            selectedMode = mode;
        }
    }
    
    gameMode = selectedMode;
    console.log(`✅ 投票結果: ${gameMode}モード (${maxVotes}票)`);
    
    broadcast({
        type: 'voting_result',
        mode: gameMode,
        votes: votes
    });
    
    // 選択されたモードでゲーム開始
    setTimeout(() => {
        startGameWithMode(gameMode);
    }, 3000);
}

function startGameWithMode(mode) {
    gameStarted = true;
    gameMode = mode;
    
    console.log(`🎮 ${mode}モードでゲーム開始！`);
    
    // PVPモードの場合、全プレイヤーにHP=10を設定
    if (mode === 'pvp') {
        for (const playerId in players) {
            players[playerId].hp = 10;
            players[playerId].alive = true;
        }
    }
    
    broadcast({
        type: 'game_start',
        mode: mode,
        players: players
    });
}

function checkGameState() {
    const playerCount = Object.keys(players).length;
    console.log(`=== ゲーム状態チェック ===`);
    console.log(`プレイヤー数: ${playerCount}`);
    console.log(`最小プレイヤー数: ${MIN_PLAYERS}`);
    console.log(`ゲーム開始済み: ${gameStarted}`);
    console.log(`投票中: ${votingActive}`);
    
    if (!gameStarted && !votingActive && playerCount >= MIN_PLAYERS) {
        console.log(`✅ 投票開始条件達成！`);
        startVoting();
    } else if (gameStarted && playerCount < 2) {
        console.log(`⚠️ プレイヤー不足でゲームリセット`);
        resetGame();
    } else if (!gameStarted && playerCount < MIN_PLAYERS) {
        console.log(`⏳ プレイヤー不足で待機状態を継続`);
        waitingForPlayers = true;
        gameStarted = false;
        votingActive = false;
        
        broadcast({
            type: 'waiting_for_players',
            currentPlayers: playerCount,
            requiredPlayers: MIN_PLAYERS
        });
    }
    console.log(`========================`);
}

function resetGame() {
    gameStarted = false;
    votingActive = false;
    gameMode = null;
    votes = { pvp: 0, tag: 0, parcour: 0 };
    votedPlayers.clear();
    oniId = null;
    
    for (const playerId in players) {
        players[playerId].hp = 10;
        players[playerId].alive = true;
        players[playerId].score = 0;
        players[playerId].itemsCollected = 0;
    }
    
    generateRedItems();
    
    broadcast({
        type: 'game_reset',
        message: 'ゲームがリセットされました'
    });
    
    checkGameState();
}

function selectRandomOni() {
    const playerIds = Object.keys(players);
    if (playerIds.length === 0) {
        oniId = null;
        return;
    }
    
    oniId = playerIds[Math.floor(Math.random() * playerIds.length)];
    if (players[oniId]) {
        players[oniId].oniStartTime = Date.now();
    }
    
    console.log(`🎲 ランダムに鬼を選択: ${oniId}`);
}

const playerUpdateLimits = new Map();

function canPlayerUpdate(playerId) {
    const now = Date.now();
    const lastUpdate = playerUpdateLimits.get(playerId) || 0;
    const updateInterval = 50;
    
    if (now - lastUpdate >= updateInterval) {
        playerUpdateLimits.set(playerId, now);
        return true;
    }
    return false;
}

function checkOniProximity() {
    if (!oniId || !players[oniId]) return;
    
    const oniPos = players[oniId];
    
    for (const playerId in players) {
        if (playerId === oniId) continue;
        
        const player = players[playerId];
        const distance = Math.sqrt(
            Math.pow(oniPos.x - player.x, 2) + 
            Math.pow(oniPos.z - player.z, 2)
        );
        
        if (distance <= 3.0) {
            console.log(`⚠️ 近接検出: 鬼 ${oniId} とプレイヤー ${playerId} の距離: ${distance.toFixed(2)}`);
        }
    }
}

// PVPモードの勝者判定
function checkPVPWinner() {
    if (gameMode !== 'pvp') return;
    
    const alivePlayers = Object.keys(players).filter(id => players[id].alive);
    
    if (alivePlayers.length === 1) {
        const winnerId = alivePlayers[0];
        console.log(`🏆 PVP勝者: ${winnerId}`);
        
        broadcast({
            type: 'pvp_winner',
            winnerId: winnerId,
            winnerName: players[winnerId].name || winnerId
        });
        
        // ゲームリセット
        setTimeout(() => {
            resetGame();
        }, 5000);
    } else if (alivePlayers.length === 0) {
        console.log(`🤝 引き分け`);
        broadcast({
            type: 'pvp_draw',
            message: '引き分けです！'
        });
        
        setTimeout(() => {
            resetGame();
        }, 5000);
    }
}

wss.on('connection', (ws) => {
    playerCounter++;
    const id = `player_${playerCounter}_${Date.now()}`;
    ws.playerId = id;
    
    const spawnPos = generateSafePosition();
    
    players[id] = {
        id: id,
        x: spawnPos.x,
        y: 1.7,
        z: spawnPos.z,
        rotation: 0,
        score: 0,
        itemsCollected: 0,
        snowballs: 0,
        oniStartTime: null,
        totalOniTime: 0,
        hp: 10,
        alive: true
    };
    
    console.log(`新しいプレイヤーが接続しました: ${id}`);
    
    ws.send(JSON.stringify({
        type: 'init',
        id: id,
        players: players,
        oniId: oniId,
        redItems: redItems,
        snowballs: snowballs,
        gameMode: gameMode,
        gameStarted: gameStarted,
        votingActive: votingActive,
        votes: votes
    }));
    
    broadcast({ 
        type: 'new_player', 
        player: players[id] 
    }, id);
    
    checkGameState();

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'vote':
                    if (processVote(id, data.mode)) {
                        sendToPlayer(id, {
                            type: 'vote_confirmed',
                            mode: data.mode
                        });
                    }
                    break;
                    
                case 'update_position':
                    if (!canPlayerUpdate(id)) break;
                    if (gameMode === 'pvp' && players[id] && !players[id].alive) break;
                    
                    if (players[id]) {
                        const newX = parseFloat(data.x);
                        const newY = parseFloat(data.y);
                        const newZ = parseFloat(data.z);
                        const newRotation = parseFloat(data.rotation);
                        
                        if (!isValidPosition(newX, newY, newZ)) {
                            console.log(`不正な位置: ${id} - (${newX}, ${newY}, ${newZ})`);
                            break;
                        }
                        
                        players[id].x = newX;
                        players[id].y = newY;
                        players[id].z = newZ;
                        players[id].rotation = newRotation;
                        
                        broadcast({ 
                            type: 'position_update', 
                            id: id, 
                            x: newX, 
                            y: newY, 
                            z: newZ, 
                            rotation: newRotation 
                        }, id);
                    }
                    break;

                case 'collect_item':
                    if (!gameStarted || gameMode === 'pvp') return;
                    
                    const itemId = data.itemId;
                    
                    if (redItems[itemId] && players[id]) {
                        const player = players[id];
                        const item = redItems[itemId];
                        const distance = Math.sqrt(
                            Math.pow(player.x - item.x, 2) + 
                            Math.pow(player.z - item.z, 2)
                        );
                        
                        if (distance <= 3.0) {
                            delete redItems[itemId];
                            players[id].itemsCollected++;
                            players[id].score += 10;
                            
                            gameStats.totalItemsCollected++;
                            
                            console.log(`✅ ${id} がアイテム ${itemId} を収集しました (合計: ${players[id].itemsCollected})`);
                            
                            broadcast({ 
                                type: 'item_collected', 
                                itemId: itemId, 
                                playerId: id, 
                                totalItems: players[id].itemsCollected 
                            });
                            
                            if (players[id].itemsCollected >= 8) {
                                players[id].snowballs++;
                                console.log(`🎉 ${id} が雪玉を獲得しました！ (合計: ${players[id].snowballs})`);
                                
                                broadcast({ 
                                    type: 'snowball_gained', 
                                    playerId: id, 
                                    totalSnowballs: players[id].snowballs 
                                });
                                
                                players[id].itemsCollected = 0;
                            }
                        } else {
                            console.log(`❌ ${id} がアイテム ${itemId} の収集に失敗: 距離 ${distance.toFixed(2)} > 3.0`);
                        }
                    }
                    break;

                case 'throw_snowball':
                    if (!gameStarted || gameMode === 'pvp') return;
                    
                    if (players[id] && players[id].snowballs > 0) {
                        players[id].snowballs--;
                        gameStats.totalSnowballsThrown++;
                        
                        const snowballId = `snowball_${snowballCounter++}`;
                        snowballs[snowballId] = {
                            id: snowballId,
                            playerId: id,
                            x: data.x,
                            y: data.y,
                            z: data.z,
                            vx: data.vx,
                            vy: data.vy,
                            vz: data.vz
                        };
                        
                        console.log(`❄️ ${id} が雪玉を投げました (残り: ${players[id].snowballs})`);
                        
                        broadcast({ 
                            type: 'snowball_thrown', 
                            snowball: snowballs[snowballId], 
                            remainingSnowballs: players[id].snowballs 
                        });
                        
                        setTimeout(() => {
                            if (snowballs[snowballId]) {
                                delete snowballs[snowballId];
                            }
                        }, 2000);
                    }
                    break;

                case 'sword_attack':
                    if (!gameStarted) return;
                    
                    // PVPモードの場合
                    if (gameMode === 'pvp' && players[id] && players[id].alive && players[data.targetId]) {
                        const attacker = players[id];
                        const target = players[data.targetId];
                        
                        if (!target.alive) break;
                        
                        const distance = Math.sqrt(
                            Math.pow(attacker.x - target.x, 2) + 
                            Math.pow(attacker.z - target.z, 2)
                        );
                        
                        console.log(`⚔️ PVP攻撃: ${id} → ${data.targetId}。距離: ${distance.toFixed(2)}`);
                        
                        if (distance <= 5.0) {
                            target.hp--;
                            
                            console.log(`✅ 攻撃成功！${data.targetId} のHP: ${target.hp}/10`);
                            
                            broadcast({
                                type: 'pvp_damage',
                                attackerId: id,
                                targetId: data.targetId,
                                hp: target.hp,
                                knockback: true
                            });
                            
                            if (target.hp <= 0) {
                                target.alive = false;
                                console.log(`💀 ${data.targetId} が倒れました`);
                                
                                broadcast({
                                    type: 'pvp_death',
                                    playerId: data.targetId
                                });
                                
                                checkPVPWinner();
                            }
                        }
                    }
                    // Tagモードの場合
                    else if (gameMode === 'tag' && data.oniId === oniId && data.oniId === id && players[data.taggedId]) {
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        console.log(`⚔️ Tag剣攻撃: 鬼 ${oniId} → ${data.taggedId}。距離: ${distance.toFixed(2)}`);
                        
                        if (distance <= 7.5) {
                            const oldOni = oniId;
                            
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100;
                            }
                            
                            oniId = data.taggedId;
                            players[oniId].oniStartTime = Date.now();
                            gameStats.totalOniChanges++;
                            
                            console.log(`✅ 剣攻撃成功！鬼変更: ${oldOni} → ${oniId}`);
                            
                            broadcast({ 
                                type: 'oni_changed', 
                                oniId: oniId,
                                taggedPlayerId: data.taggedId
                            });
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    ws.on('close', () => {
        console.log(`プレイヤーが切断しました: ${id}`);
        
        const wasOni = (id === oniId);
        
        delete players[id];
        delete playerRanks[id];
        playerUpdateLimits.delete(id);
        votedPlayers.delete(id);
        
        broadcast({ type: 'remove_player', id: id });
        
        if (wasOni && gameMode === 'tag') {
            selectRandomOni();
        }
        
        checkGameState();
    });

    ws.on('error', (error) => {
        console.error(`プレイヤー ${id} でエラーが発生しました:`, error);
    });

    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

const proximityCheckInterval = setInterval(() => {
    if (gameStarted && gameMode === 'tag') {
        checkOniProximity();
    }
}, 2000);

const healthCheckInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

function gracefulShutdown() {
    console.log('サーバーをシャットダウンしています...');
    
    if (countdownInterval) clearInterval(countdownInterval);
    if (gameTimerInterval) clearInterval(gameTimerInterval);
    clearInterval(proximityCheckInterval);
    clearInterval(healthCheckInterval);
    
    broadcast({ type: 'server_shutdown', message: 'サーバーがメンテナンスのため停止します' });
    
    wss.clients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('サーバーが正常に停止しました');
        process.exit(0);
    });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

server.listen(port, () => {
    console.log(`=================================`);
    console.log(`🎮 3Dマルチプレイヤーゲームサーバーが起動しました`);
    console.log(`📍 ポート: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`👥 最小プレイヤー数: ${MIN_PLAYERS}人`);
    console.log(`⏱️  制限時間: ${GAME_TIME_LIMIT}秒（4分）`);
    console.log(`=================================`);
});