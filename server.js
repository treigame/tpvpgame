// 初期生成（サーバー起動時に確実に実行）
console.log('サーバー起動時の赤いアイテム生成...');
generateRedItems();

// ワープホールの定期生成（30-90秒間隔）
function scheduleNextWarpHoleGeneration() {
    const interval = (Math.random() * 60 + 30) * 1000; // 30-90秒
    setTimeout(() => {
        generateWarpHoles();
        scheduleNextWarpHoleGeneration(); // 次の生成をスケジュール
    }, interval);
}

// 初回ワープホール生成（ゲーム開始から30秒後）
setTimeout(() => {
    generateWarpHoles();
    scheduleNextWarpHoleGeneration();
}, 30000);const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let redItems = {}; // 赤いアイテム（オーブの代替）
let snowballs = {}; // 投げられた雪玉
let warpHoles = {}; // ワープホール
let playerRanks = {}; // プレイヤーのランク情報
let oniId = null;
const RED_ITEM_COUNT = 20; // 赤いアイテムの数
let playerCounter = 0;
let snowballCounter = 0;
let warpHoleCounter = 0;

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

// 建物内の位置リスト（ワープホール用）
const buildingPositions = [
    // 中央迷路内
    { x: 5, z: 5 }, { x: -5, z: -5 }, { x: 0, z: 10 },
    // 塔の周辺
    { x: 55, z: 55 }, { x: -55, z: 55 }, { x: 55, z: -55 }, { x: -55, z: -55 },
    // L字建物内
    { x: 25, z: 0 }, { x: -25, z: 0 }, { x: 0, z: 25 }, { x: 0, z: -25 },
    // 隠れ家周辺
    { x: 40, z: 15 }, { x: -40, z: 15 }, { x: 40, z: -15 }, { x: -40, z: -15 },
    { x: 15, z: 40 }, { x: -15, z: 40 }, { x: 15, z: -40 }, { x: -15, z: -40 }
];

// ワープホールの生成
function generateWarpHoles() {
    const warpHoleCount = Math.floor(Math.random() * 3) + 2; // 2-4個のワープホール
    
    for (let i = 0; i < warpHoleCount; i++) {
        const warpHoleId = `warp_hole_${warpHoleCounter++}`;
        const position = buildingPositions[Math.floor(Math.random() * buildingPositions.length)];
        
        warpHoles[warpHoleId] = {
            id: warpHoleId,
            x: position.x + (Math.random() - 0.5) * 4, // 少しランダムにずらす
            y: 1.0,
            z: position.z + (Math.random() - 0.5) * 4,
            spawnTime: Date.now()
        };
        
        // 全プレイヤーにワープホール出現を通知
        broadcast({
            type: 'warp_hole_spawned',
            warpHoleId: warpHoleId,
            warpHole: warpHoles[warpHoleId]
        });
        
        console.log(`ワープホール出現: ${warpHoleId} at (${warpHoles[warpHoleId].x.toFixed(1)}, ${warpHoles[warpHoleId].y}, ${warpHoles[warpHoleId].z.toFixed(1)})`);
        
        // 30-60秒後にワープホールを消滅
        const lifetime = (Math.random() * 30 + 30) * 1000; // 30-60秒
        setTimeout(() => {
            if (warpHoles[warpHoleId]) {
                delete warpHoles[warpHoleId];
                broadcast({
                    type: 'warp_hole_despawned',
                    warpHoleId: warpHoleId
                });
                console.log(`ワープホール消滅: ${warpHoleId}`);
            }
        }, lifetime);
    }
}

// サーバー側でのブロック衝突判定（削除済み）
function isPositionInBlock(x, z, y = 1.7) {
    return false; // ブロックなし
}

// ブロックを避けて安全な位置を生成（簡素化）
function generateSafePosition() {
    const x = (Math.random() - 0.5) * 150;
    const z = (Math.random() - 0.5) * 150;
    return { x, z };
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

// 赤いアイテム生成関数（ブロックを避ける）
function generateRedItems() {
    redItems = {};
    console.log('赤いアイテム強制生成開始...');
    
    for (let i = 0; i < RED_ITEM_COUNT; i++) {
        const itemId = `red_item_${i}`;
        const position = generateSafePosition();
        
        redItems[itemId] = {
            id: itemId,
            x: position.x,
            y: 2.0,
            z: position.z,
        };
        
        console.log(`強制生成: ${itemId} at (${position.x.toFixed(1)}, 2.0, ${position.z.toFixed(1)})`);
    }
    
    console.log(`赤いアイテム強制生成完了: ${Object.keys(redItems).length}個`);
}

// 初期生成（サーバー起動時に確実に実行）
console.log('サーバー起動時の赤いアイテム生成...');
generateRedItems();

// 赤いアイテムの時間経過での自動出現システム
const itemSpawnHistory = []; // 出現履歴
const ITEM_RESPAWN_TIME = 30000; // 30秒後に再出現

// 取得されたアイテムの位置を記録
function recordItemPosition(itemId, position) {
    itemSpawnHistory.push({
        itemId: itemId,
        position: position,
        collectedTime: Date.now()
    });
    
    // 30秒後に同じ位置に再出現
    setTimeout(() => {
        respawnItemAtPosition(itemId, position);
    }, ITEM_RESPAWN_TIME);
}

// 指定位置にアイテムを再出現
function respawnItemAtPosition(originalId, position) {
    // 新しいIDで再生成
    const newItemId = `respawn_item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 元の位置から少しずらして配置
    let newX = position.x + (Math.random() - 0.5) * 4;
    let newZ = position.z + (Math.random() - 0.5) * 4;
    
    // ブロックとの衝突を確認し、必要に応じて安全な位置を生成
    if (isPositionInBlock(newX, newZ)) {
        const safePos = generateSafePosition();
        newX = safePos.x;
        newZ = safePos.z;
    }
    
    redItems[newItemId] = {
        id: newItemId,
        x: newX,
        y: position.y,
        z: newZ,
    };
    
    // 全プレイヤーに新しいアイテム出現を通知
    broadcast({
        type: 'item_respawned',
        itemId: newItemId,
        item: redItems[newItemId]
    });
    
    console.log(`アイテム再出現: ${newItemId} at (${redItems[newItemId].x.toFixed(1)}, ${redItems[newItemId].y}, ${redItems[newItemId].z.toFixed(1)})`);
}

// 生成確認
console.log(`生成された赤いアイテム一覧:`);
for (const itemId in redItems) {
    console.log(`  ${itemId}: (${redItems[itemId].x}, ${redItems[itemId].y}, ${redItems[itemId].z})`);
}

// 強制的に赤いアイテムを生成（フォールバック）
if (Object.keys(redItems).length === 0) {
    console.log('緊急: 赤いアイテムが0個なので強制生成します');
    for (let i = 0; i < RED_ITEM_COUNT; i++) {
        const itemId = `red_item_${i}`;
        const position = generateSafePosition();
        redItems[itemId] = {
            id: itemId,
            x: position.x,
            y: 1.0,
            z: position.z,
        };
    }
    console.log(`強制生成完了: ${Object.keys(redItems).length}個`);
}

// 鬼の自動選択
function selectRandomOni() {
    const playerIds = Object.keys(players);
    if (playerIds.length > 0) {
        const newOniId = playerIds[Math.floor(Math.random() * playerIds.length)];
        if (oniId !== newOniId) {
            oniId = newOniId;
            broadcast({ type: 'oni_changed', oniId: oniId });
            console.log(`新しい鬼が選ばれました: ${oniId}`);
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

// 雪玉の当たり判定
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
        
        if (distance < 3) { // 3ユニット以内で命中
            broadcast({ 
                type: 'snowball_hit', 
                snowballId: snowballId,
                hitPlayerId: oniId
            });
            
            console.log(`雪玉が鬼 ${oniId} に命中！ゲームオーバー！`);
            
            // ゲームリセット（3秒後）
            setTimeout(() => {
                resetGame();
            }, 3000);
        }
    }
    
    // 雪玉を削除
    delete snowballs[snowballId];
}

// ゲームリセット
function resetGame() {
    console.log('ゲームをリセットします...');
    
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
        score: 0
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
                        warpHoles: warpHoles,
                        oniId: oniId 
                    };
                    
                    console.log('送信データ:', JSON.stringify(initData, null, 2));
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
                        // 位置データの検証（簡素化）
                        if (isValidPosition(data.x, data.y, data.z)) {
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
                            console.log(`不正な位置データを受信: ${id}`, data);
                        }
                    }
                    break;
                    
                case 'use_warp_hole':
                    // ワープホール使用
                    if (warpHoles[data.warpHoleId] && players[id]) {
                        // ランダムな位置にワープ
                        const warpTargets = [
                            { x: 70, z: 70 }, { x: -70, z: 70 }, { x: 70, z: -70 }, { x: -70, z: -70 },
                            { x: 50, z: 0 }, { x: -50, z: 0 }, { x: 0, z: 50 }, { x: 0, z: -50 },
                            { x: 30, z: 30 }, { x: -30, z: 30 }, { x: 30, z: -30 }, { x: -30, z: -30 }
                        ];
                        
                        const targetPos = warpTargets[Math.floor(Math.random() * warpTargets.length)];
                        
                        // プレイヤー位置を更新
                        players[id].x = targetPos.x;
                        players[id].y = 1.7;
                        players[id].z = targetPos.z;
                        
                        // ワープ通知を送信
                        sendToPlayer(id, {
                            type: 'player_warped',
                            playerId: id,
                            newX: targetPos.x,
                            newY: 1.7,
                            newZ: targetPos.z
                        });
                        
                        // 他のプレイヤーに位置更新を送信
                        broadcast({
                            type: 'player_update',
                            id: id,
                            x: players[id].x,
                            y: players[id].y,
                            z: players[id].z
                        }, id);
                        
                        console.log(`プレイヤー ${id} がワープホール ${data.warpHoleId} を使用して (${targetPos.x}, 1.7, ${targetPos.z}) にワープしました`);
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
                        
                        // アイテム位置を記録（30秒後の再出現用）
                        recordItemPosition(data.itemId, itemPosition);
                        
                        delete redItems[data.itemId];
                        players[id].score += 10;
                        broadcast({ 
                            type: 'red_item_collected', 
                            itemId: data.itemId,
                            playerId: id
                        });
                        console.log(`赤いアイテム ${data.itemId} が ${id} によって取得されました`);
                        console.log(`残り赤いアイテム数: ${Object.keys(redItems).length}`);
                        console.log(`30秒後に位置 (${itemPosition.x.toFixed(1)}, ${itemPosition.y}, ${itemPosition.z.toFixed(1)}) に再出現予定`);
                        
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
                        broadcast({ 
                            type: 'snowball_thrown', 
                            snowballId: snowballId,
                            snowball: snowball
                        });
                        
                        console.log(`雪玉 ${snowballId} が ${id} によって投げられました`);
                        
                        // 雪玉の当たり判定（簡易版）
                        setTimeout(() => {
                            checkSnowballHit(snowballId, snowball);
                        }, 1000); // 1秒後に当たり判定
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
                    if (data.playerId !== oniId) {
                        const oldOni = oniId;
                        oniId = data.playerId;
                        
                        broadcast({ type: 'oni_changed', oniId: oniId });
                        console.log(`！マーククリックで鬼が交代しました: ${oldOni} → ${oniId}`);
                    }
                    break;
                    
                case 'tag_player':
                    // 直接タッチ・剣攻撃による鬼交代を確実に処理
                    console.log(`鬼交代要求受信: 送信者=${data.id}, 鬼=${oniId}, ターゲット=${data.taggedId}`);
                    
                    if (data.id === oniId && data.id === id && players[data.taggedId]) {
                        const oldOni = oniId;
                        oniId = data.taggedId;
                        
                        // スコア更新
                        if (players[oldOni]) {
                            players[oldOni].score += 100;
                        }
                        
                        // 全プレイヤーに鬼交代を通知
                        const changeMessage = { type: 'oni_changed', oniId: oniId };
                        broadcast(changeMessage);
                        
                        console.log(`鬼交代完了: ${oldOni} → ${oniId}`);
                        console.log(`交代メッセージ送信:`, changeMessage);
                    } else {
                        console.log(`鬼交代要求却下: 条件不一致`);
                        console.log(`  送信者が鬼か: ${data.id === oniId}`);
                        console.log(`  送信者が本人か: ${data.id === id}`);
                        console.log(`  ターゲット存在: ${!!players[data.taggedId]}`);
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
        delete playerRanks[id]; // ランク情報も削除
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
    console.log('=== ゲーム統計 ===');
    console.log(`プレイヤー数: ${Object.keys(players).length}`);
    console.log(`赤いアイテム数: ${Object.keys(redItems).length}`);
    console.log(`雪玉数: ${Object.keys(snowballs).length}`);
    console.log(`ワープホール数: ${Object.keys(warpHoles).length}`);
    console.log(`現在の鬼: ${oniId}`);
    console.log(`アクティブ接続数: ${wss.clients.size}`);
    console.log(`ランク付きプレイヤー数: ${Object.keys(playerRanks).length}`);
    
    // プレイヤースコアランキング
    const sortedPlayers = Object.values(players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    console.log('=== トップ5プレイヤー ===');
    sortedPlayers.forEach((player, index) => {
        const rank = playerRanks[player.id] ? ` [${playerRanks[player.id]}]` : '';
        console.log(`${index + 1}. ${player.id}${rank}: ${player.score}点`);
    });
    console.log('========================');
}, 10 * 60 * 1000);

// グレースフルシャットダウン
function gracefulShutdown() {
    console.log('サーバーをシャットダウンしています...');
    
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
    console.log(`🌀 ワープホールシステム有効`);
    console.log(`⚡ 移動速度: 0.7倍（56.0）`);
    console.log(`🏗️ 鬼ごっこ用建物配置済み`);
    console.log(`=================================`);
});