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

let gameStarted = false;
let waitingForPlayers = false;
let countdownInterval = null;
let gameTimerInterval = null;
const MIN_PLAYERS = 3;
const GAME_TIME_LIMIT = 240;

// ゲームモードと投票システム
let gameMode = null; // 'pvp', 'tag', 'parcour'
let votingActive = false;
let votes = { pvp: 0, tag: 0, parcour: 0 };
let votedPlayers = new Set();


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
        
        if (votedPlayers.size >= MIN_PLAYERS) {
            finalizeVoting();
        }
        
        return true;
    }
    
    return false;
}

function finalizeVoting() {
    votingActive = false;
    
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
    
    setTimeout(() => {
        startGameWithMode(gameMode);
    }, 3000);
}

function startGameWithMode(mode) {
    gameStarted = true;
    gameMode = mode;
    
    console.log(`🎮 ${mode}モードでゲーム開始！`);
    
    if (mode === 'pvp') {
        for (const playerId in players) {
            players[playerId].hp = 10;
            players[playerId].alive = true;
        }
    } else if (mode === 'tag') {
        selectRandomOni();
    } else if (mode === 'parcour') {
        // Parcourモード：全プレイヤーを空中のスタート地点にワープ
        for (const playerId in players) {
            players[playerId].x = 0;
            players[playerId].y = 7;
            players[playerId].z = 0;
            
            sendToPlayer(playerId, {
                type: 'force_position',
                x: 0,
                y: 7,
                z: 0
            });
        }
        console.log('🧗 全プレイヤーを空中パルクールのスタート地点にワープ');
    }
    
    broadcast({
        type: 'game_start',
        mode: mode,
        players: players,
        oniId: oniId
    });
}

function checkPVPWinner() {
    if (gameMode !== 'pvp') return;
    
    const alivePlayers = Object.keys(players).filter(id => players[id].alive);
    
    if (alivePlayers.length === 1) {
        const winnerId = alivePlayers[0];
        console.log(`🏆 PVP勝者: ${winnerId}`);
        
        broadcast({
            type: 'pvp_winner',
            winnerId: winnerId
        });
        
        setTimeout(() => {
            resetGame();
        }, 5000);
    } else if (alivePlayers.length === 0) {
        broadcast({
            type: 'pvp_draw'
        });
        
        setTimeout(() => {
            resetGame();
        }, 5000);
    }
}


function checkGameState() {
    const playerCount = Object.keys(players).length;
    console.log(`=== ゲーム状態チェック ===`);
    console.log(`プレイヤー数: ${playerCount}`);
    console.log(`最小プレイヤー数: ${MIN_PLAYERS}`);
    console.log(`ゲーム開始済み: ${gameStarted}`);
    console.log(`待機中: ${waitingForPlayers}`);
    console.log(`カウントダウン実行中: ${countdownInterval !== null}`);
    
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
        if (countdownInterval) {
            console.log(`❌ カウントダウンを停止`);
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        broadcast({
            type: 'waiting_for_players',
            currentPlayers: playerCount,
            requiredPlayers: MIN_PLAYERS
        });
    }
    console.log(`========================`);
}

function startGameCountdown() {
    if (countdownInterval) {
        console.log('カウントダウンは既に実行中です');
        return;
    }
    
    waitingForPlayers = false;
    let countdown = 5;
    
    console.log('ゲーム開始カウントダウン開始！全プレイヤーを地上に配置します');
    
    for (const playerId in players) {
        const safePos = generateSafePosition();
        players[playerId].x = safePos.x;
        players[playerId].y = 1.7;
        players[playerId].z = safePos.z;
        
        sendToPlayer(playerId, {
            type: 'force_position',
            x: safePos.x,
            y: 1.7,
            z: safePos.z
        });
        
        console.log(`プレイヤー ${playerId} を配置: (${safePos.x.toFixed(1)}, 1.7, ${safePos.z.toFixed(1)})`);
    }
    
    for (const playerId in players) {
        broadcast({
            type: 'player_update',
            id: playerId,
            x: players[playerId].x,
            y: players[playerId].y,
            z: players[playerId].z
        });
    }
    
    broadcast({
        type: 'game_countdown',
        countdown: countdown
    });
    console.log(`カウントダウン送信: ${countdown}`);
    
    countdownInterval = setInterval(() => {
        countdown--;
        console.log(`カウントダウン: ${countdown}`);
        
        if (countdown > 0) {
            broadcast({
                type: 'game_countdown',
                countdown: countdown
            });
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            console.log('カウントダウン完了 - ゲーム開始');
            startGame();
        }
    }, 1000);
}

function startGame() {
    gameStarted = true;
    waitingForPlayers = false;
    selectRandomOni();
    
    broadcast({
        type: 'game_countdown',
        countdown: 0
    });
    
    console.log(`ゲーム開始！プレイヤー数: ${Object.keys(players).length}, 鬼: ${oniId}`);
    gameStats.totalGames++;
    
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
    }
    
    const gameStartTime = Date.now();
    gameTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
        const remaining = GAME_TIME_LIMIT - elapsed;
        
        if (remaining <= 0) {
            clearInterval(gameTimerInterval);
            gameTimerInterval = null;
            endGame('players');
        }
    }, 1000);
}

function endGame(winner) {
    gameStarted = false;
    
    broadcast({
        type: 'game_over',
        winner: winner
    });
    
    console.log(`ゲーム終了: ${winner === 'players' ? 'プレイヤーの勝利' : '鬼の勝利'}`);
    
    setTimeout(() => {
        resetGame();
    }, 10000);
}

function selectRandomOni() {
    const playerIds = Object.keys(players);
    if (playerIds.length > 0) {
        const newOniId = playerIds[Math.floor(Math.random() * playerIds.length)];
        if (oniId !== newOniId) {
            const oldOni = oniId;
            oniId = newOniId;
            gameStats.totalOniChanges++;
            
            broadcast({ type: 'oni_changed', oniId: oniId });
            console.log(`新しい鬼が選ばれました: ${oldOni} → ${oniId}`);
        }
    } else {
        oniId = null;
    }
}

function resetGame() {
    console.log('ゲームをリセットします...');
    
    gameStarted = false;
    waitingForPlayers = true;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    if (gameTimerInterval) {
        clearInterval(gameTimerInterval);
        gameTimerInterval = null;
    }
    
    for (const playerId in players) {
        players[playerId].score = 0;
        players[playerId].itemsCollected = 0;
    }
    
    broadcast({ type: 'game_reset' });
    
    generateRedItems();
    snowballs = {};
    snowballCounter = 0;
    
    broadcast({ 
        type: 'game_restarted',
        redItems: redItems,
        oniId: oniId
    });
    
    checkGameState();
    console.log('ゲームリセット完了');
}

const playerUpdateLimits = new Map();
const UPDATE_RATE_LIMIT = 20;

function canUpdatePlayer(playerId) {
    const now = Date.now();
    const lastUpdate = playerUpdateLimits.get(playerId) || 0;
    
    if (now - lastUpdate >= UPDATE_RATE_LIMIT) {
        playerUpdateLimits.set(playerId, now);
        return true;
    }
    return false;
}

function checkSnowballHit(snowballId, snowball) {
    if (!snowballs[snowballId]) return;
    
    const targetPos = { x: snowball.targetX, y: snowball.targetY, z: snowball.targetZ };
    
    if (players[oniId]) {
        const oniPos = players[oniId];
        const distance = Math.sqrt(
            Math.pow(targetPos.x - oniPos.x, 2) + 
            Math.pow(targetPos.z - oniPos.z, 2)
        );
        
        if (distance < 4) {
            broadcast({ 
                type: 'snowball_hit', 
                snowballId: snowballId,
                hitPlayerId: oniId
            });
            
            console.log(`雪玉が鬼 ${oniId} に命中！ゲームオーバー！`);
            gameStats.totalGames++;
            
            setTimeout(() => {
                endGame('players');
            }, 3000);
            
            return true;
        }
    }
    
    return false;
}

function generateSafeSpawnPosition() {
    const position = generateSafePosition();
    return {
        x: position.x,
        y: 1.7,
        z: position.z
    };
}

function checkOniProximity() {
    if (!oniId || Object.keys(players).length < 2 || !gameStarted) return;
    
    const oniPos = players[oniId];
    if (!oniPos) return;
    
    for (const playerId in players) {
        if (playerId === oniId) continue;
        
        const player = players[playerId];
        const distance = Math.sqrt(
            Math.pow(oniPos.x - player.x, 2) + 
            Math.pow(oniPos.z - player.z, 2)
        );
        
        if (distance < 3) {
            sendToPlayer(playerId, {
                type: 'show_exclamation',
                playerId: playerId
            });
        } else {
            sendToPlayer(playerId, {
                type: 'hide_exclamation',
                playerId: playerId
            });
        }
    }
}

wss.on('connection', (ws, req) => {
    const id = `player_${playerCounter++}`;
    const clientIP = req.socket.remoteAddress;
    
    const spawnPos = generateSafeSpawnPosition();
    players[id] = { 
        id: id, 
        x: spawnPos.x,
        y: spawnPos.y, 
        z: spawnPos.z,
        lastUpdate: Date.now(),
        score: 0,
        itemsCollected: 0,
        totalOniTime: 0,
        connectionTime: Date.now()
    };
    
    ws.playerId = id;
    console.log(`新しいプレイヤーが接続: ${id} (IP: ${clientIP}) at (${spawnPos.x.toFixed(1)}, ${spawnPos.y}, ${spawnPos.z.toFixed(1)})`);
    
    if (gameStarted && (!oniId || Object.keys(players).length === 1)) {
        oniId = id;
        console.log(`${id} が鬼に設定されました`);
    }
    
    ws.connectionEstablished = true;
    
    setTimeout(() => {
        checkGameState();
    }, 200);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'get_id':
                    console.log(`プレイヤー ${id} に初期化データを送信中...`);
                    
                    const initData = { 
                        type: 'init', 
                        id: id, 
                        players: players, 
                        redItems: redItems,
                        oniId: oniId,
                        gameStarted: gameStarted,
                        waitingForPlayers: waitingForPlayers
                    };
                    
                    ws.send(JSON.stringify(initData));
                    
                    ws.send(JSON.stringify({
                        type: 'force_position',
                        x: players[id].x,
                        y: players[id].y,
                        z: players[id].z
                    }));
                    
                    broadcast({ 
                        type: 'player_update', 
                        id: id, 
                        x: players[id].x, 
                        y: players[id].y, 
                        z: players[id].z 
                    }, id);
                    
                    setTimeout(() => {
                        checkGameState();
                    }, 100);
                    break;
                    
                case 'move':
                    const player = players[data.id];
                    if (!player || data.id !== id) return;
                    
                    if (!canUpdatePlayer(data.id)) return;
                    
                    if (isValidPosition(data.x, data.y, data.z)) {
                        if (!isPositionInBlock(data.x, data.z, data.y)) {
                            const oldPos = { x: player.x, y: player.y, z: player.z };
                            
                            player.x = parseFloat(data.x);
                            player.y = parseFloat(data.y);
                            player.z = parseFloat(data.z);
                            player.lastUpdate = Date.now();
                            
                            const moveDistance = Math.sqrt(
                                Math.pow(player.x - oldPos.x, 2) + 
                                Math.pow(player.z - oldPos.z, 2)
                            );
                            
                            if (moveDistance > 10.0) {
                                console.log(`⚠️ プレイヤー ${id} の移動距離が異常: ${moveDistance.toFixed(2)}`);
                                player.x = oldPos.x;
                                player.y = oldPos.y;
                                player.z = oldPos.z;
                                return;
                            }
                            
                            const updateMessage = { 
                                type: 'player_update', 
                                id: data.id, 
                                x: player.x, 
                                y: player.y, 
                                z: player.z 
                            };
                            
                            broadcast(updateMessage, id);
                        }
                    }
                    break;
                    
                case 'set_rank':
                    if (data.playerId === id && data.rank === 'OWNER') {
                        playerRanks[id] = data.rank;
                        console.log(`プレイヤー ${id} にランク ${data.rank} を付与しました`);
                        
                        broadcast({
                            type: 'player_rank_updated',
                            playerId: id,
                            rank: data.rank
                        });
                    }
                    break;
                    
                case 'collect_red_item':
                    if (!gameStarted) return;
                    
                    if (redItems[data.itemId]) {
                        const itemPosition = { ...redItems[data.itemId] };
                        
                        delete redItems[data.itemId];
                        players[id].score += 10;
                        players[id].itemsCollected += 1;
                        gameStats.totalItemsCollected++;
                        
                        broadcast({ 
                            type: 'red_item_collected', 
                            itemId: data.itemId,
                            playerId: id
                        });
                        
                        setTimeout(() => {
                            const newItemId = `respawn_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            let newPos;
                            let attempts = 0;
                            
                            do {
                                const offsetX = (Math.random() - 0.5) * 15;
                                const offsetZ = (Math.random() - 0.5) * 15;
                                newPos = {
                                    x: itemPosition.x + offsetX,
                                    z: itemPosition.z + offsetZ
                                };
                                attempts++;
                            } while (isPositionInBlock(newPos.x, newPos.z) && attempts < 10);
                            
                            if (attempts >= 10) {
                                newPos = generateSafePosition();
                            }
                            
                            redItems[newItemId] = {
                                id: newItemId,
                                x: newPos.x,
                                y: itemPosition.y,
                                z: newPos.z,
                            };
                            
                            broadcast({
                                type: 'item_respawned',
                                itemId: newItemId,
                                item: redItems[newItemId]
                            });
                        }, 25000);
                        
                        if (Object.keys(redItems).length === 0) {
                            generateRedItems();
                            broadcast({ type: 'items_respawned', redItems: redItems });
                        }
                    }
                    break;

                case 'throw_snowball':
                    if (id !== oniId && gameStarted) {
                        const snowballId = `snowball_${snowballCounter++}`;
                        const snowball = {
                            id: snowballId,
                            playerId: id,
                            x: data.startX,
                            y: data.startY,
                            z: data.startZ,
                            targetX: data.targetX,
                            targetY: data.targetY,
                            targetZ: data.targetZ,
                            startTime: Date.now()
                        };
                        
                        snowballs[snowballId] = snowball;
                        gameStats.totalSnowballsThrown++;
                        
                        broadcast({ 
                            type: 'snowball_thrown', 
                            snowballId: snowballId,
                            snowball: snowball
                        });
                        
                        setTimeout(() => {
                            if (checkSnowballHit(snowballId, snowball)) {
                            } else {
                                delete snowballs[snowballId];
                            }
                        }, 2000);
                    }
                    break;

                case 'become_oni':
                    if (!gameStarted) return;
                    
                    if (data.playerId !== oniId && players[data.playerId]) {
                        const oldOni = oniId;
                        
                        if (players[oldOni]) {
                            players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                        }
                        
                        oniId = data.playerId;
                        players[oniId].oniStartTime = Date.now();
                        gameStats.totalOniChanges++;
                        
                        console.log(`🔄 become_oni: 鬼変更 ${oldOni} → ${oniId}`);
                        broadcast({ type: 'oni_changed', oniId: oniId, taggedPlayerId: data.playerId });
                    }
                    break;
                    
                case 'auto_tag':
                    if (!gameStarted) return;
                    
                    if (data.oniId === oniId && data.oniId === id && players[data.taggedId]) {
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        console.log(`🎯 自動タッチ判定: 鬼 ${oniId} → プレイヤー ${data.taggedId}。距離: ${distance.toFixed(2)}`);
                        
                        if (distance <= 3.0) {
                            const oldOni = oniId;
                            
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100;
                            }
                            
                            oniId = data.taggedId;
                            players[oniId].oniStartTime = Date.now();
                            gameStats.totalOniChanges++;
                            
                            console.log(`✅ 鬼が自動変更されました: ${oldOni} → ${oniId}`);
                            
                            broadcast({ 
                                type: 'oni_changed', 
                                oniId: oniId,
                                taggedPlayerId: data.taggedId
                            });
                        } else {
                            console.log(`❌ 自動タッチ失敗: 距離が遠すぎます (${distance.toFixed(2)} > 3.0)`);
                        }
                    }
                    break;
                    
                case 'sword_attack':
                    if (!gameStarted) return;
                    
                    if (data.oniId === oniId && data.oniId === id && players[data.taggedId]) {
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        console.log(`⚔️ 剣攻撃判定: 鬼 ${oniId} → プレイヤー ${data.taggedId}。距離: ${distance.toFixed(2)}`);
                        
                        if (distance <= 7.5) {
                            const oldOni = oniId;
                            
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100;
                            }
                            
                            oniId = data.taggedId;
                            players[oniId].oniStartTime = Date.now();
                            gameStats.totalOniChanges++;
                            
                            console.log(`✅ 剣攻撃成功！鬼が変更されました: ${oldOni} → ${oniId}`);
                            
                            broadcast({ 
                                type: 'oni_changed', 
                                oniId: oniId,
                                taggedPlayerId: data.taggedId
                            });
                        } else {
                            console.log(`❌ 剣攻撃失敗: 距離が遠すぎます (${distance.toFixed(2)} > 7.5)`);
                        }
                    }
                    break;
                    
                                
                case 'vote':
                    if (processVote(id, data.mode)) {
                        sendToPlayer(id, {
                            type: 'vote_confirmed',
                            mode: data.mode
                        });
                    }
                    break;
                    
                case 'pvp_attack':
                    if (!gameStarted || gameMode !== 'pvp') return;
                    
                    if (players[id] && players[id].alive && players[data.targetId]) {
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
                                hp: target.hp
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
                    break;

                case 'tag_player':
                    if (!gameStarted) return;
                    
                    if (data.id === oniId && data.id === id && players[data.taggedId]) {
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        console.log(`鬼 ${oniId} がプレイヤー ${data.taggedId} をタッチ。距離: ${distance.toFixed(2)}`);
                        
                        if (distance <= 5.0) {
                            const oldOni = oniId;
                            
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100;
                            }
                            
                            oniId = data.taggedId;
                            players[oniId].oniStartTime = Date.now();
                            gameStats.totalOniChanges++;
                            
                            console.log(`✅ 鬼が変更されました: ${oldOni} → ${oniId}`);
                            
                            const changeMessage = { type: 'oni_changed', oniId: oniId, taggedPlayerId: data.taggedId };
                            broadcast(changeMessage);
                        } else {
                            console.log(`❌ タッチ失敗: 距離が遠すぎます (${distance.toFixed(2)} > 5.0)`);
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
        
        broadcast({ type: 'remove_player', id: id });
        
        if (wasOni) {
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
    if (gameStarted) {
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
    console.log(`🎮 3D鬼ごっこサーバーが起動しました`);
    console.log(`📍 ポート: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`👥 最小プレイヤー数: ${MIN_PLAYERS}人`);
    console.log(`⏱️  制限時間: ${GAME_TIME_LIMIT}秒（4分）`);
    console.log(`=================================`);
});