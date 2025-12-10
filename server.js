const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '')));

const port = process.env.PORT || 10000;

let players = {};
let games = {};
let waitingPlayer = null;

class ChessGame {
    constructor(whiteId, blackId) {
        this.whiteId = whiteId;
        this.blackId = blackId;
        this.currentTurn = 'white';
        this.board = this.initBoard();
        this.captured = { white: [], black: [] };
        this.moveHistory = [];
    }
    
    initBoard() {
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // 黒の駒
        board[0] = [
            {type: 'rook', color: 'black'},
            {type: 'knight', color: 'black'},
            {type: 'bishop', color: 'black'},
            {type: 'queen', color: 'black'},
            {type: 'king', color: 'black'},
            {type: 'bishop', color: 'black'},
            {type: 'knight', color: 'black'},
            {type: 'rook', color: 'black'}
        ];
        board[1] = Array(8).fill(null).map(() => ({type: 'pawn', color: 'black'}));
        
        // 白の駒
        board[6] = Array(8).fill(null).map(() => ({type: 'pawn', color: 'white'}));
        board[7] = [
            {type: 'rook', color: 'white'},
            {type: 'knight', color: 'white'},
            {type: 'bishop', color: 'white'},
            {type: 'queen', color: 'white'},
            {type: 'king', color: 'white'},
            {type: 'bishop', color: 'white'},
            {type: 'knight', color: 'white'},
            {type: 'rook', color: 'white'}
        ];
        
        return board;
    }
    
    isValidMove(from, to, color) {
        const piece = this.board[from.row][from.col];
        
        if (!piece || piece.color !== color) return false;
        if (piece.color !== this.currentTurn) return false;
        
        const targetPiece = this.board[to.row][to.col];
        if (targetPiece && targetPiece.color === color) return false;
        
        // 基本的な移動ルール（簡易版）
        switch (piece.type) {
            case 'pawn':
                return this.isValidPawnMove(from, to, piece.color);
            case 'rook':
                return this.isValidRookMove(from, to);
            case 'knight':
                return this.isValidKnightMove(from, to);
            case 'bishop':
                return this.isValidBishopMove(from, to);
            case 'queen':
                return this.isValidQueenMove(from, to);
            case 'king':
                return this.isValidKingMove(from, to);
            default:
                return false;
        }
    }
    
    isValidPawnMove(from, to, color) {
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;
        
        // 前進
        if (from.col === to.col && !this.board[to.row][to.col]) {
            if (to.row === from.row + direction) return true;
            if (from.row === startRow && to.row === from.row + 2 * direction) {
                return !this.board[from.row + direction][from.col];
            }
        }
        
        // 斜め取り
        if (Math.abs(from.col - to.col) === 1 && to.row === from.row + direction) {
            return this.board[to.row][to.col] !== null;
        }
        
        return false;
    }
    
    isValidRookMove(from, to) {
        if (from.row !== to.row && from.col !== to.col) return false;
        return this.isPathClear(from, to);
    }
    
    isValidKnightMove(from, to) {
        const rowDiff = Math.abs(from.row - to.row);
        const colDiff = Math.abs(from.col - to.col);
        return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
    }
    
    isValidBishopMove(from, to) {
        if (Math.abs(from.row - to.row) !== Math.abs(from.col - to.col)) return false;
        return this.isPathClear(from, to);
    }
    
    isValidQueenMove(from, to) {
        return this.isValidRookMove(from, to) || this.isValidBishopMove(from, to);
    }
    
    isValidKingMove(from, to) {
        return Math.abs(from.row - to.row) <= 1 && Math.abs(from.col - to.col) <= 1;
    }
    
    isPathClear(from, to) {
        const rowDir = Math.sign(to.row - from.row);
        const colDir = Math.sign(to.col - from.col);
        
        let row = from.row + rowDir;
        let col = from.col + colDir;
        
        while (row !== to.row || col !== to.col) {
            if (this.board[row][col]) return false;
            row += rowDir;
            col += colDir;
        }
        
        return true;
    }
    
    makeMove(from, to) {
        const piece = this.board[from.row][from.col];
        const capturedPiece = this.board[to.row][to.col];
        
        if (capturedPiece) {
            this.captured[this.currentTurn].push(capturedPiece.type);
        }
        
        this.board[to.row][to.col] = piece;
        this.board[from.row][from.col] = null;
        
        this.moveHistory.push({ from, to, piece, captured: capturedPiece });
        this.currentTurn = this.currentTurn === 'white' ? 'black' : 'white';
    }
    
    isCheckmate() {
        // 簡易実装: キングが取られた場合
        let whiteKing = false;
        let blackKing = false;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.type === 'king') {
                    if (piece.color === 'white') whiteKing = true;
                    if (piece.color === 'black') blackKing = true;
                }
            }
        }
        
        if (!whiteKing) return 'black';
        if (!blackKing) return 'white';
        return null;
    }
}

wss.on('connection', (ws, req) => {
    const id = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`新しいプレイヤーが接続: ${id}`);
    
    ws.playerId = id;
    players[id] = { ws, color: null, gameId: null };
    
    if (!waitingPlayer) {
        waitingPlayer = id;
        players[id].color = 'white';
        
        ws.send(JSON.stringify({
            type: 'init',
            id: id,
            color: 'white',
            gameState: null,
            currentTurn: 'white',
            isGameActive: false,
            playerCount: 1
        }));
    } else {
        const gameId = `game_${Date.now()}`;
        const whiteId = waitingPlayer;
        const blackId = id;
        
        players[blackId].color = 'black';
        players[whiteId].gameId = gameId;
        players[blackId].gameId = gameId;
        
        const game = new ChessGame(whiteId, blackId);
        games[gameId] = game;
        
        const gameData = {
            board: game.board,
            currentTurn: game.currentTurn,
            captured: game.captured
        };
        
        players[whiteId].ws.send(JSON.stringify({
            type: 'game_start',
            gameState: gameData,
            currentTurn: game.currentTurn
        }));
        
        players[blackId].ws.send(JSON.stringify({
            type: 'init',
            id: blackId,
            color: 'black',
            gameState: gameData,
            currentTurn: game.currentTurn,
            isGameActive: true
        }));
        
        waitingPlayer = null;
        console.log(`ゲーム開始: ${gameId}`);
    }
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const player = players[id];
            
            if (!player) return;
            
            switch (data.type) {
                case 'move':
                    if (!player.gameId) return;
                    
                    const game = games[player.gameId];
                    if (!game) return;
                    
                    if (game.isValidMove(data.from, data.to, player.color)) {
                        game.makeMove(data.from, data.to);
                        
                        const gameData = {
                            board: game.board,
                            currentTurn: game.currentTurn,
                            captured: game.captured
                        };
                        
                        const opponentId = player.color === 'white' ? game.blackId : game.whiteId;
                        
                        players[game.whiteId].ws.send(JSON.stringify({
                            type: 'move',
                            gameState: gameData,
                            currentTurn: game.currentTurn,
                            captured: game.captured
                        }));
                        
                        players[game.blackId].ws.send(JSON.stringify({
                            type: 'move',
                            gameState: gameData,
                            currentTurn: game.currentTurn,
                            captured: game.captured
                        }));
                        
                        const winner = game.isCheckmate();
                        if (winner) {
                            players[game.whiteId].ws.send(JSON.stringify({
                                type: 'game_over',
                                winner: winner,
                                reason: 'checkmate'
                            }));
                            
                            players[game.blackId].ws.send(JSON.stringify({
                                type: 'game_over',
                                winner: winner,
                                reason: 'checkmate'
                            }));
                            
                            delete games[player.gameId];
                        }
                    } else {
                        ws.send(JSON.stringify({ type: 'invalid_move' }));
                    }
                    break;
            }
        } catch (error) {
            console.error('メッセージの解析に失敗:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`プレイヤーが切断: ${id}`);
        
        const player = players[id];
        if (player && player.gameId) {
            const game = games[player.gameId];
            if (game) {
                const opponentId = player.color === 'white' ? game.blackId : game.whiteId;
                if (players[opponentId]) {
                    players[opponentId].ws.send(JSON.stringify({
                        type: 'player_disconnected'
                    }));
                }
                delete games[player.gameId];
            }
        }
        
        if (waitingPlayer === id) {
            waitingPlayer = null;
        }
        
        delete players[id];
    });
});

server.listen(port, () => {
    console.log(`=================================`);
    console.log(`♟️ オンラインチェスサーバーが起動しました`);
    console.log(`📍 ポート: ${port}`);
    console.log(`🌐 URL: http://localhost:${port}`);
    console.log(`=================================`);
});