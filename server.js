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

// ゲーム状態管理
let gameStarted = false;
let waitingForPlayers = false;
let countdownInterval = null;
const MIN_PLAYERS = 3; // 最小プレイヤー数

// ゲーム統計
let gameStats = {
    totalGames: 0,
    totalOniChanges: 0,
    totalSnowballsThrown: 0,
    totalItemsCollected: 0,
    startTime: Date.now()
};

// プレイヤーデータの検証関数
function isValidPosition(x, y, z) {
    const BOUNDARY = 95;
    return x >= -BOUNDARY && x <= BOUNDARY && 
           z >= -BOUNDARY && z <= BOUNDARY && 
           y >= 0 && y <= 50;
}

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, '')));

const port = process.env.PORT || 10000;

// 建物と障害物の定義
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

// ブロードキャスト関数
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

// 特定のプレイヤーにメッセージを送信
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

// 赤いアイテム生成関数
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

// 初期生成
generateRedItems();

// ゲーム状態管理（デバッグ強化版）
function checkGameState() {
    const playerCount = Object.keys(players).length;
    console.log(`=== ゲーム状態チェック ===`);
    console.log(`プレイヤー数: ${playerCount}`);
    console.log(`最小プレイヤー数: ${MIN_PLAYERS}`);
    console.log(`ゲーム開始済み: ${gameStarted}`);
    console.log(`待機中: ${waitingForPlayers}`);
    console.log(`カウントダウン実行中: ${countdownInterval !== null}`);
    console.log(`プレイヤー一覧: ${Object.keys(players).join(', ')}`);
    
    if (!gameStarted && playerCount >= MIN_PLAYERS && !countdownInterval) {
        console.log(`✅ ゲーム開始条件達成！カウントダウンを開始します`);
        startGameCountdown();
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
    } else {
        console.log(`ℹ️ 状態変更なし - 現状維持`);
    }
    console.log(`========================`);
}

// ゲーム開始カウントダウン
function startGameCountdown() {
    if (countdownInterval) {
        console.log('カウントダウンは既に実行中です');
        return;
    }
    
    waitingForPlayers = false;
    let countdown = 5;
    
    console.log('ゲーム開始カウントダウン開始！');
    
    // 全プレイヤーを空中にランダム配置
    for (const playerId in players) {
        players[playerId].x = (Math.random() - 0.5) * 20;
        players[playerId].y = 15;
        players[playerId].z = (Math.random() - 0.5) * 20;
        console.log(`プレイヤー ${playerId} を空中に配置: (${players[playerId].x.toFixed(1)}, 15, ${players[playerId].z.toFixed(1)})`);
    }
    
    // 最初のカウントダウンを即座に送信
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

// ゲーム開始
function startGame() {
    gameStarted = true;
    waitingForPlayers = false;
    
    // 鬼をランダム選択
    selectRandomOni();
    
    // 全プレイヤーに開始を通知
    broadcast({
        type: 'game_countdown',
        countdown: 0
    });
    
    console.log(`ゲーム開始！プレイヤー数: ${Object.keys(players).length}, 鬼: ${oniId}`);
    gameStats.totalGames++;
}

// 鬼の選択
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

// ゲームリセット
function resetGame() {
    console.log('ゲームをリセットします...');
    
    gameStarted = false;
    waitingForPlayers = true;
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // プレイヤー統計をリセット
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

// プレイヤーの位置更新レート制限
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

// 雪玉の当たり判定
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
                resetGame();
            }, 3000);
            
            return true;
        }
    }
    
    return false;
}

// プレイヤーの安全な初期位置生成
function generateSafeSpawnPosition() {
    if (!gameStarted) {
        // ゲーム開始前は空中に固定
        return {
            x: (Math.random() - 0.5) * 20,
            y: 15,
            z: (Math.random() - 0.5) * 20
        };
    } else {
        // ゲーム中は地上にスポーン
        const position = generateSafePosition();
        return {
            x: position.x,
            y: 1.7,
            z: position.z
        };
    }
}

// 鬼交代の近接チェック
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
        
        // 3ユニット以内で感嘆符表示
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

// WebSocket接続処理
wss.on('connection', (ws, req) => {
    const id = `player_${playerCounter++}`;
    const clientIP = req.socket.remoteAddress;
    
    // プレイヤーの初期化
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
    console.log(`新しいプレイヤーが接続しました: ${id} (IP: ${clientIP}) at (${spawnPos.x.toFixed(1)}, ${spawnPos.y}, ${spawnPos.z.toFixed(1)})`);
    
    // 最初のプレイヤーまたは鬼が不在でゲーム中の場合、鬼に設定
    if (gameStarted && (!oniId || Object.keys(players).length === 1)) {
        oniId = id;
        console.log(`${id} が鬼に設定されました`);
    }
    
    // 接続完了後、少し遅延してゲーム状態をチェック
    ws.connectionEstablished = true;
    console.log(`プレイヤー ${id} の接続が完了しました`);
    
    // ゲーム状態をチェック（最後に実行）
    setTimeout(() => {
        console.log(`遅延チェック開始（プレイヤー ${id} 用）`);
        checkGameState();
    }, 200);
    
    // メッセージ処理
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'get_id':
                    console.log(`プレイヤー ${id} に初期化データを送信中...`);
                    
                    // 初期化データを送信
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
                    
                    console.log(`初期化データ送信完了: プレイヤー数=${Object.keys(players).length}, ゲーム状態=${gameStarted ? '進行中' : '待機中'}`);
                    
                    // 他のプレイヤーに新しいプレイヤーの参加を通知
                    broadcast({ 
                        type: 'player_update', 
                        id: id, 
                        x: players[id].x, 
                        y: players[id].y, 
                        z: players[id].z 
                    }, id);
                    
                    // ここでゲーム状態をチェック（重要！）
                    setTimeout(() => {
                        checkGameState();
                    }, 100);
                    break;
                    
                case 'move':
                    // ゲーム開始前は移動を無効化
                    if (!gameStarted) {
                        console.log(`プレイヤー ${id} の移動を拒否: ゲーム未開始`);
                        return;
                    }
                    
                    // レート制限チェック
                    if (!canUpdatePlayer(data.id)) {
                        return;
                    }
                    
                    const player = players[data.id];
                    if (player && data.id === id) {
                        // 位置データの検証
                        if (isValidPosition(data.x, data.y, data.z)) {
                            // サーバー側でも衝突チェック
                            if (!isPositionInBlock(data.x, data.z, data.y)) {
                                const oldPos = { x: player.x, y: player.y, z: player.z };
                                
                                player.x = parseFloat(data.x);
                                player.y = parseFloat(data.y);
                                player.z = parseFloat(data.z);
                                player.lastUpdate = Date.now();
                                
                                // 移動距離をチェック（テレポート防止）
                                const moveDistance = Math.sqrt(
                                    Math.pow(player.x - oldPos.x, 2) + 
                                    Math.pow(player.z - oldPos.z, 2)
                                );
                                
                                if (moveDistance > 5.0) {
                                    console.log(`⚠️ プレイヤー ${id} の移動距離が異常: ${moveDistance.toFixed(2)}`);
                                    // 異常な移動は拒否して元の位置に戻す
                                    player.x = oldPos.x;
                                    player.y = oldPos.y;
                                    player.z = oldPos.z;
                                    return;
                                }
                                
                                // 他のプレイヤーに位置更新を送信
                                const updateMessage = { 
                                    type: 'player_update', 
                                    id: data.id, 
                                    x: player.x, 
                                    y: player.y, 
                                    z: player.z 
                                };
                                
                                broadcast(updateMessage, id);
                                console.log(`プレイヤー ${id} 位置更新: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)})`);
                            } else {
                                console.log(`プレイヤー ${id} が建物内への移動を試行 - 拒否`);
                            }
                        } else {
                            console.log(`不正な位置データを受信: ${id}`, data);
                        }
                    }
                    break;
                    
                case 'set_rank':
                    // ランク設定
                    if (data.playerId === id && data.rank === 'OWNER') {
                        playerRanks[id] = data.rank;
                        console.log(`プレイヤー ${id} にランク ${data.rank} を付与しました`);
                        
                        // 全プレイヤーにランク更新を通知
                        broadcast({
                            type: 'player_rank_updated',
                            playerId: id,
                            rank: data.rank
                        });
                    }
                    break;
                    
                case 'collect_red_item':
                    if (!gameStarted) return;
                    
                    console.log(`プレイヤー ${id} が赤いアイテム ${data.itemId} を取得しようとしています`);
                    if (redItems[data.itemId]) {
                        const itemPosition = { ...redItems[data.itemId] };
                        
                        console.log(`赤いアイテム ${data.itemId} を削除し、スコアを更新します`);
                        
                        delete redItems[data.itemId];
                        players[id].score += 10;
                        players[id].itemsCollected += 1;
                        gameStats.totalItemsCollected++;
                        
                        broadcast({ 
                            type: 'red_item_collected', 
                            itemId: data.itemId,
                            playerId: id
                        });
                        
                        console.log(`赤いアイテム ${data.itemId} が ${id} によって取得されました`);
                        
                        // 25秒後に再出現
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
                        
                        // すべての赤いアイテムが取得された場合、新しいアイテムを生成
                        if (Object.keys(redItems).length === 0) {
                            console.log('すべての赤いアイテムが取得されました。新しいアイテムを生成します。');
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
                        
                        console.log(`雪玉 ${snowballId} が ${id} によって投げられました`);
                        
                        // 雪玉の当たり判定
                        setTimeout(() => {
                            if (checkSnowballHit(snowballId, snowball)) {
                                // 命中した場合は既に処理済み
                            } else {
                                // 外れた場合は雪玉を削除
                                delete snowballs[snowballId];
                            }
                        }, 2000);
                    }
                    break;

                case 'become_oni':
                    if (!gameStarted) return;
                    
                    // ！マーククリックで鬼交代
                    if (data.playerId !== oniId && players[data.playerId]) {
                        const oldOni = oniId;
                        
                        // 前の鬼の時間を記録
                        if (players[oldOni]) {
                            players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                        }
                        
                        oniId = data.playerId;
                        players[oniId].oniStartTime = Date.now();
                        gameStats.totalOniChanges++;
                        
                        broadcast({ type: 'oni_changed', oniId: oniId });
                        console.log(`！マーククリックで鬼が交代しました: ${oldOni} → ${oniId}`);
                    }
                    break;
                    
                case 'tag_player':
                    if (!gameStarted) return;
                    
                    // 直接タッチ・剣攻撃による鬼交代
                    console.log(`鬼交代要求受信: 送信者=${data.id}, 鬼=${oniId}, ターゲット=${data.taggedId}`);
                    
                    if (data.id === oniId && data.id === id && players[data.taggedId]) {
                        // 距離チェック（チート防止）
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        if (distance <= 5.0) {
                            const oldOni = oniId;
                            
                            // 前の鬼の時間を記録
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100;
                            }
                            
                            oniId = data.taggedId;
                            players[oniId].oniStartTime = Date.now();
                            gameStats.totalOniChanges++;
                            
                            // 全プレイヤーに鬼交代を通知
                            const changeMessage = { type: 'oni_changed', oniId: oniId };
                            broadcast(changeMessage);
                            
                            console.log(`鬼交代完了: ${oldOni} → ${oniId} (距離: ${distance.toFixed(2)})`);
                        } else {
                            console.log(`鬼交代要求却下: 距離が遠すぎます (${distance.toFixed(2)}ユニット)`);
                        }
                    }
                    break;
                
                case 'force_start_game':
                    // 管理者用の強制ゲーム開始コマンド
                    if (playerRanks[id] === 'OWNER') {
                        console.log(`🔧 OWNER ${id} によってゲーム強制開始`);
                        if (!gameStarted && !countdownInterval) {
                            startGameCountdown();
                        } else {
                            console.log(`⚠️ ゲーム開始失敗: 既に開始済みまたはカウントダウン中`);
                        }
                    }
                    break;
                    
                default:
                    console.log(`未知のメッセージタイプ: ${data.type}`);
            }
        } catch (error) {
            console.error('メッセージの解析に失敗しました:', error);
        }
    });

    // プレイヤー切断処理
    ws.on('close', () => {
        console.log(`プレイヤーが切断しました: ${id}`);
        
        // プレイヤーデータを削除
        delete players[id];
        delete playerRanks[id];
        playerUpdateLimits.delete(id);
        
        // 他のプレイヤーに切断を通知
        broadcast({ type: 'remove_player', id: id });
        
        // 鬼が切断した場合の処理
        if (id === oniId) {
            console.log(`鬼が切断しました: ${id}`);
            selectRandomOni();
        }
        
        // ゲーム状態をチェック
        checkGameState();
        
        console.log(`現在のプレイヤー数: ${Object.keys(players).length}`);
    });

    // エラー処理
    ws.on('error', (error) => {
        console.error(`プレイヤー ${id} でエラーが発生しました:`, error);
    });

    // 接続のヘルスチェック
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// 定期的な鬼の近接チェック（2秒間隔）
const proximityCheckInterval = setInterval(() => {
    if (gameStarted) {
        checkOniProximity();
    }
}, 2000);

// 定期的なヘルスチェック（30秒間隔）
const healthCheckInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`非アクティブな接続を終了: ${ws.playerId}`);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

// 非アクティブプレイヤーのクリーンアップ（2分間隔）
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5分
    
    for (const playerId in players) {
        const player = players[playerId];
        if (now - player.lastUpdate > INACTIVE_TIMEOUT) {
            console.log(`非アクティブなプレイヤーを削除: ${playerId}`);
            delete players[playerId];
            delete playerRanks[playerId];
            playerUpdateLimits.delete(playerId);
            broadcast({ type: 'remove_player', id: playerId });
            
            if (playerId === oniId) {
                selectRandomOni();
            }
            
            checkGameState();
        }
    }
}, 2 * 60 * 1000);

// ゲーム統計の定期出力（10分間隔）
const statsInterval = setInterval(() => {
    const uptime = Math.floor((Date.now() - gameStats.startTime) / 60000);
    
    console.log('=== ゲーム統計 ===');
    console.log(`サーバー稼働時間: ${uptime}分`);
    console.log(`プレイヤー数: ${Object.keys(players).length}`);
    console.log(`ゲーム状態: ${gameStarted ? '進行中' : (waitingForPlayers ? '待機中' : '停止中')}`);
    console.log(`赤いアイテム数: ${Object.keys(redItems).length}`);
    console.log(`雪玉数: ${Object.keys(snowballs).length}`);
    console.log(`現在の鬼: ${oniId}`);
    console.log(`アクティブ接続数: ${wss.clients.size}`);
    console.log(`総ゲーム数: ${gameStats.totalGames}`);
    console.log(`総鬼交代回数: ${gameStats.totalOniChanges}`);
    console.log(`総雪玉投擲数: ${gameStats.totalSnowballsThrown}`);
    console.log(`総アイテム収集数: ${gameStats.totalItemsCollected}`);
    console.log('========================');
}, 10 * 60 * 1000);

// グレースフルシャットダウン
function gracefulShutdown() {
    console.log('サーバーをシャットダウンしています...');
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    clearInterval(proximityCheckInterval);
    clearInterval(healthCheckInterval);
    clearInterval(cleanupInterval);
    clearInterval(statsInterval);
    
    // すべてのクライアントに切断を通知
    broadcast({ type: 'server_shutdown', message: 'サーバーがメンテナンスのため停止します' });
    
    // 接続を閉じる
    wss.clients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('サーバーが正常に停止しました');
        process.exit(0);
    });
}

// シグナルハンドリング
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未処理のエラーをキャッチ
process.on('uncaughtException', (error) => {
    console.error('未処理の例外:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('未処理のPromise拒否:', reason);
});

// サーバー起動
server.listen(port, () => {
    console.log(`=================================`);
    console.log(`🎮 3D鬼ごっこサーバーが起動しました`);
    console.log(`📍 ポート: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`👥 最小プレイヤー数: ${MIN_PLAYERS}人`);
    console.log(`🎯 赤いアイテム数: ${RED_ITEM_COUNT}`);
    console.log(`❄️ 雪玉システム有効`);
    console.log(`👑 ランクシステム有効`);
    console.log(`🏗️ 構造化された建物配置`);
    console.log(`⚡ 3人待機・カウントダウンシステム`);
    console.log(`📊 統計システム有効`);
    console.log(`=================================`);
});