const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let redItems = {}; // 赤いアイテム（オーブの代替）
let snowballs = {}; // 投げられた雪玉
let playerRanks = {}; // プレイヤーのランク情報
let oniId = null;
const RED_ITEM_COUNT = 25; // 赤いアイテムの数を増加
let playerCounter = 0;
let snowballCounter = 0;

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

// 建物と障害物の定義（クライアントと同期）
const buildingPositions = [
    // 中央広場の建物群
    { pos: [0, 4, 0], size: [12, 8, 12] },
    { pos: [20, 3, 20], size: [8, 6, 8] },
    { pos: [-20, 3, 20], size: [8, 6, 8] },
    { pos: [20, 3, -20], size: [8, 6, 8] },
    { pos: [-20, 3, -20], size: [8, 6, 8] },
    
    // 外周エリアの建物
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
    
    // 迷路風の小さな建物群
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
    
    // 特殊建物
    { pos: [0, 6, 40], size: [8, 12, 8] },
    { pos: [0, 6, -40], size: [8, 12, 8] },
];

// サーバー側でのブロック衝突判定
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

// ブロックを避けて安全な位置を生成
function generateSafePosition() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (attempts < maxAttempts) {
        const x = (Math.random() - 0.5) * 180; // 範囲を少し狭める
        const z = (Math.random() - 0.5) * 180;
        
        if (!isPositionInBlock(x, z)) {
            return { x, z };
        }
        attempts++;
    }
    
    // フォールバック：中央付近の安全な位置
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

// 赤いアイテム生成関数（改良版）
function generateRedItems() {
    redItems = {};
    console.log('赤いアイテム生成開始...');
    
    // 戦略的な配置エリア
    const itemZones = [
        // 中央エリア
        { center: [0, 0], radius: 25, count: 5 },
        // 四角エリア
        { center: [40, 40], radius: 20, count: 3 },
        { center: [-40, 40], radius: 20, count: 3 },
        { center: [40, -40], radius: 20, count: 3 },
        { center: [-40, -40], radius: 20, count: 3 },
        // 外周エリア
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
            
            console.log(`アイテム配置: ${itemId} at (${position.x.toFixed(1)}, 2.0, ${position.z.toFixed(1)})`);
        }
    }
    
    console.log(`赤いアイテム生成完了: ${Object.keys(redItems).length}個`);
}

// 初期生成
generateRedItems();

// 赤いアイテムの時間経過での自動出現システム（改良版）
const itemSpawnHistory = [];
const ITEM_RESPAWN_TIME = 25000; // 25秒後に再出現

function recordItemPosition(itemId, position) {
    itemSpawnHistory.push({
        itemId: itemId,
        position: position,
        collectedTime: Date.now()
    });
    
    // 25秒後に同じゾーンに再出現
    setTimeout(() => {
        respawnItemInZone(itemId, position);
    }, ITEM_RESPAWN_TIME);
}

function respawnItemInZone(originalId, originalPosition) {
    const newItemId = `respawn_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 同じゾーンの近くに配置
    let newPos;
    let attempts = 0;
    
    do {
        const offsetX = (Math.random() - 0.5) * 15;
        const offsetZ = (Math.random() - 0.5) * 15;
        newPos = {
            x: originalPosition.x + offsetX,
            z: originalPosition.z + offsetZ
        };
        attempts++;
    } while (isPositionInBlock(newPos.x, newPos.z) && attempts < 10);
    
    if (attempts >= 10) {
        newPos = generateSafePosition();
    }
    
    redItems[newItemId] = {
        id: newItemId,
        x: newPos.x,
        y: originalPosition.y,
        z: newPos.z,
    };
    
    broadcast({
        type: 'item_respawned',
        itemId: newItemId,
        item: redItems[newItemId]
    });
    
    console.log(`アイテム再出現: ${newItemId} at (${redItems[newItemId].x.toFixed(1)}, ${redItems[newItemId].y}, ${redItems[newItemId].z.toFixed(1)})`);
}

// 鬼の自動選択（改良版）
function selectRandomOni() {
    const playerIds = Object.keys(players);
    if (playerIds.length > 0) {
        // 鬼時間が最も短いプレイヤーを優先
        let candidates = playerIds.map(id => ({
            id: id,
            oniTime: players[id].totalOniTime || 0
        })).sort((a, b) => a.oniTime - b.oniTime);
        
        // 上位3人からランダム選択（フェアネス向上）
        const topCandidates = candidates.slice(0, Math.min(3, candidates.length));
        const newOniId = topCandidates[Math.floor(Math.random() * topCandidates.length)].id;
        
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

// 改良された雪玉の当たり判定
function checkSnowballHit(snowballId, snowball) {
    if (!snowballs[snowballId]) return;
    
    const targetPos = { x: snowball.targetX, y: snowball.targetY, z: snowball.targetZ };
    
    // 鬼との距離をチェック
    if (players[oniId]) {
        const oniPos = players[oniId];
        const distance = Math.sqrt(
            Math.pow(targetPos.x - oniPos.x, 2) + 
            Math.pow(targetPos.z - oniPos.z, 2)
        );
        
        if (distance < 4) { // 4ユニット以内で命中
            broadcast({ 
                type: 'snowball_hit', 
                snowballId: snowballId,
                hitPlayerId: oniId
            });
            
            console.log(`雪玉が鬼 ${oniId} に命中！ゲームオーバー！`);
            
            // 統計更新
            gameStats.totalGames++;
            
            // ゲームリセット（3秒後）
            setTimeout(() => {
                resetGame();
            }, 3000);
            
            return true;
        }
    }
    
    return false;
}

// ゲームリセット（改良版）
function resetGame() {
    console.log('ゲームをリセットします...');
    
    // プレイヤー統計をリセット
    for (const playerId in players) {
        players[playerId].score = 0;
        players[playerId].itemsCollected = 0;
    }
    
    // 全プレイヤーにリセット通知
    broadcast({ type: 'game_reset' });
    
    // ゲーム状態をリセット
    generateRedItems();
    snowballs = {};
    snowballCounter = 0;
    
    // 新しい鬼を選択
    selectRandomOni();
    
    broadcast({ 
        type: 'game_restarted',
        redItems: redItems,
        oniId: oniId
    });
    
    console.log('ゲームリセット完了');
}

// プレイヤーの安全な初期位置生成
function generateSafeSpawnPosition() {
    const position = generateSafePosition();
    return {
        x: position.x,
        y: 1.7,
        z: position.z
    };
}

// 鬼交代の近接チェック（改良版）
function checkOniProximity() {
    if (!oniId || Object.keys(players).length < 2) return;
    
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
    
    // プレイヤーの初期化（ブロックを避けた安全な位置に配置）
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
    
    // 最初のプレイヤーまたは鬼が不在の場合、鬼に設定
    if (!oniId || Object.keys(players).length === 1) {
        oniId = id;
        console.log(`${id} が鬼に設定されました`);
    }
    
    // メッセージ処理
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'get_id':
                    console.log(`プレイヤー ${id} に初期化データを送信中...`);
                    console.log(`送信予定の赤いアイテム数: ${Object.keys(redItems).length}`);
                    
                    // 初期化データを送信
                    const initData = { 
                        type: 'init', 
                        id: id, 
                        players: players, 
                        redItems: redItems,
                        oniId: oniId 
                    };
                    
                    ws.send(JSON.stringify(initData));
                    
                    console.log(`初期化データ送信完了: プレイヤー数=${Object.keys(players).length}, 赤いアイテム数=${Object.keys(redItems).length}`);
                    
                    // 他のプレイヤーに新しいプレイヤーの参加を通知
                    broadcast({ 
                        type: 'player_update', 
                        id: id, 
                        x: players[id].x, 
                        y: players[id].y, 
                        z: players[id].z 
                    }, id);
                    break;
                    
                case 'move':
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
                                player.x = parseFloat(data.x);
                                player.y = parseFloat(data.y);
                                player.z = parseFloat(data.z);
                                player.lastUpdate = Date.now();
                                
                                // 他のプレイヤーに位置更新を送信
                                broadcast({ 
                                    type: 'player_update', 
                                    id: data.id, 
                                    x: player.x, 
                                    y: player.y, 
                                    z: player.z 
                                }, id);
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
                    console.log(`プレイヤー ${id} が赤いアイテム ${data.itemId} を取得しようとしています`);
                    if (redItems[data.itemId]) {
                        const itemPosition = { ...redItems[data.itemId] }; // 位置を保存
                        
                        console.log(`赤いアイテム ${data.itemId} を削除し、スコアを更新します`);
                        
                        // アイテム位置を記録（25秒後の再出現用）
                        recordItemPosition(data.itemId, itemPosition);
                        
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
                        console.log(`残り赤いアイテム数: ${Object.keys(redItems).length}`);
                        
                        // すべての赤いアイテムが取得された場合、新しいアイテムを生成
                        if (Object.keys(redItems).length === 0) {
                            console.log('すべての赤いアイテムが取得されました。新しいアイテムを生成します。');
                            generateRedItems();
                            broadcast({ type: 'items_respawned', redItems: redItems });
                            console.log(`新しい赤いアイテムを ${Object.keys(redItems).length}個生成しました`);
                        }
                    } else {
                        console.log(`エラー: 赤いアイテム ${data.itemId} が存在しません`);
                    }
                    break;

                case 'throw_snowball':
                    if (id !== oniId) { // 鬼以外が投げる場合のみ
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
                        
                        // 雪玉の当たり判定（改良版）
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

                case 'show_exclamation':
                    // ！マーク表示要求
                    broadcast({ 
                        type: 'show_exclamation', 
                        playerId: data.playerId 
                    });
                    break;

                case 'hide_exclamation':
                    // ！マーク非表示要求
                    broadcast({ 
                        type: 'hide_exclamation', 
                        playerId: data.playerId 
                    });
                    break;

                case 'become_oni':
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
                    // 直接タッチ・剣攻撃による鬼交代を確実に処理
                    console.log(`鬼交代要求受信: 送信者=${data.id}, 鬼=${oniId}, ターゲット=${data.taggedId}`);
                    
                    if (data.id === oniId && data.id === id && players[data.taggedId]) {
                        // 距離チェック（チート防止）
                        const oniPos = players[oniId];
                        const targetPos = players[data.taggedId];
                        const distance = Math.sqrt(
                            Math.pow(oniPos.x - targetPos.x, 2) + 
                            Math.pow(oniPos.z - targetPos.z, 2)
                        );
                        
                        if (distance <= 5.0) { // 5ユニット以内でのみ有効
                            const oldOni = oniId;
                            
                            // 前の鬼の時間を記録
                            if (players[oldOni]) {
                                players[oldOni].totalOniTime += Date.now() - (players[oldOni].oniStartTime || Date.now());
                                players[oldOni].score += 100; // 鬼交代ボーナス
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
                    } else {
                        console.log(`鬼交代要求却下: 条件不一致`);
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
    checkOniProximity();
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
        }
    }
}, 2 * 60 * 1000);

// ゲーム統計の定期出力（10分間隔）
const statsInterval = setInterval(() => {
    const uptime = Math.floor((Date.now() - gameStats.startTime) / 60000);
    
    console.log('=== ゲーム統計 ===');
    console.log(`サーバー稼働時間: ${uptime}分`);
    console.log(`プレイヤー数: ${Object.keys(players).length}`);
    console.log(`赤いアイテム数: ${Object.keys(redItems).length}`);
    console.log(`雪玉数: ${Object.keys(snowballs).length}`);
    console.log(`現在の鬼: ${oniId}`);
    console.log(`アクティブ接続数: ${wss.clients.size}`);
    console.log(`ランク付きプレイヤー数: ${Object.keys(playerRanks).length}`);
    console.log(`総ゲーム数: ${gameStats.totalGames}`);
    console.log(`総鬼交代回数: ${gameStats.totalOniChanges}`);
    console.log(`総雪玉投擲数: ${gameStats.totalSnowballsThrown}`);
    console.log(`総アイテム収集数: ${gameStats.totalItemsCollected}`);
    
    // プレイヤースコアランキング
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    console.log('=== トップ5プレイヤー ===');
    sortedPlayers.forEach((player, index) => {
        const rank = playerRanks[player.id] ? ` [${playerRanks[player.id]}]` : '';
        const oniTime = Math.floor((player.totalOniTime || 0) / 1000);
        console.log(`${index + 1}. ${player.id}${rank}: ${player.score}点 (鬼時間: ${oniTime}秒, アイテム: ${player.itemsCollected}個)`);
    });
    console.log('========================');
}, 10 * 60 * 1000);

// グレースフルシャットダウン
function gracefulShutdown() {
    console.log('サーバーをシャットダウンしています...');
    
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
    console.log(`🎯 赤いアイテム数: ${RED_ITEM_COUNT}`);
    console.log(`❄️ 雪玉システム有効`);
    console.log(`👑 ランクシステム有効`);
    console.log(`🏗️ 構造化された建物配置`);
    console.log(`⚡ 改良された鬼ごっこシステム`);
    console.log(`📊 統計システム有効`);
    console.log(`=================================`);
});