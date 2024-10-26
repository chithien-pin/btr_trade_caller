const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');

// Thay token này bằng token API bot Telegram của bạn
const telegramToken = '7998101040:AAEpu_imCbGh3t5qA2w24jOglsUAqE7hDCE';

// Tạo một bot Telegram
const bot = new TelegramBot(telegramToken, { polling: true });

// API Key và Secret Key của Binance
const BINANCE_API_KEY = 'YOUR_BINANCE_API_KEY';
const BINANCE_SECRET_KEY = 'YOUR_BINANCE_SECRET_KEY';

// Endpoint của Binance để lấy giá
const binanceUrl = 'https://api.binance.com/api/v3/ticker/price';

// Hàm lấy giá từ Binance
async function getPrice(symbol) {
    try {
        const response = await axios.get(binanceUrl, {
            params: {
                symbol: symbol,
            }
        });
        return parseFloat(response.data.price);
    } catch (error) {
        console.error('Lỗi khi lấy giá từ Binance:', error);
    }
}

// Hàm xác định vùng thanh khoản dựa trên các đỉnh (high) và đáy (low) trước đó
function identifyLiquidityPools(price, historicalData) {
    const recentHigh = Math.max(...historicalData.map(candle => candle.high));
    const recentLow = Math.min(...historicalData.map(candle => candle.low));
    let strPrice = (price).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
    if (price > recentHigh) {
        return `Giá phá vỡ vùng thanh khoản phía trên (Liquidity Pool)! Xem xét vào lệnh bán. ${strPrice}`;
    } else if (price < recentLow) {
        return `Giá phá vỡ vùng thanh khoản phía dưới! Xem xét vào lệnh mua. ${strPrice}`;
    }
    return null;
}

// Hàm xác định Order Block (các vùng có sự đảo chiều mạnh)
function identifyOrderBlocks(price, historicalData) {
    const lastCandle = historicalData[historicalData.length - 1];
    const prevCandle = historicalData[historicalData.length - 2];
    let strPrice = (price).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
    // Kiểm tra xem có một khối lệnh giảm giá (Bearish Order Block)
    if (lastCandle.high > prevCandle.high && lastCandle.close < prevCandle.open) {
        if (price < lastCandle.low) {
            return `Giá chạm vào vùng Order Block giảm! Xem xét vào lệnh mua. ${strPrice}`;
        }
    }

    // Kiểm tra khối lệnh tăng giá (Bullish Order Block)
    if (lastCandle.low < prevCandle.low && lastCandle.close > prevCandle.open) {
        if (price > lastCandle.high) {
            return `Giá chạm vào vùng Order Block tăng! Xem xét vào lệnh bán. ${strPrice}`;
        }
    }

    return null;
}

// Hàm xác định Fair Value Gap (khoảng trống giá trị hợp lý)
function identifyFairValueGap(price, historicalData) {
    const lastCandle = historicalData[historicalData.length - 1];
    const prevCandle = historicalData[historicalData.length - 2];
    const secondPrevCandle = historicalData[historicalData.length - 3];
    let strPrice = (price).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
    // Fair Value Gap khi có khoảng trống giữa nến thứ nhất và thứ ba
    if (secondPrevCandle.low > prevCandle.high) {
        return `Xuất hiện khoảng trống giá trị hợp lý (Fair Value Gap)! Giá có thể lấp đầy khoảng trống này. ${strPrice}`;
    }

    return null;
}

function checkICTConditions(price, historicalData) {
    // Mức rủi ro và tỷ lệ lợi nhuận so với rủi ro
    const riskRewardRatio = 2; // Tỷ lệ lợi nhuận/rủi ro, ví dụ 2:1
    const stopLossBuffer = 0.002; // Buffer để đặt cắt lỗ dưới vùng thanh khoản hoặc Order Block

    // Kiểm tra Liquidity Pools
    const liquiditySignal = identifyLiquidityPools(price, historicalData);
    if (liquiditySignal) {
        // Ví dụ: Đặt mức SL và TP dựa trên vùng thanh khoản
        const entryPrice = price;
        const stopLoss = price * (1 - stopLossBuffer); // Cắt lỗ cách giá hiện tại 0.2%
        const takeProfit = price + (price - stopLoss) * riskRewardRatio; // TP theo tỷ lệ RR 2:1
        return {
            signal: liquiditySignal,
            entry: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
        };
    }

    // Kiểm tra Order Blocks
    const orderBlockSignal = identifyOrderBlocks(price, historicalData);
    if (orderBlockSignal) {
        const entryPrice = price;
        const stopLoss = price * (1 - stopLossBuffer); // Cắt lỗ ngay dưới Order Block
        const takeProfit = price + (price - stopLoss) * riskRewardRatio; // TP theo tỷ lệ RR 2:1
        return {
            signal: orderBlockSignal,
            entry: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
        };
    }

    // Kiểm tra Fair Value Gaps
    const fvgSignal = identifyFairValueGap(price, historicalData);
    if (fvgSignal) {
        const entryPrice = price;
        const stopLoss = price * (1 - stopLossBuffer); // Cắt lỗ dưới FVG
        const takeProfit = price + (price - stopLoss) * riskRewardRatio; // TP theo tỷ lệ RR 2:1
        return {
            signal: fvgSignal,
            entry: entryPrice,
            stopLoss: stopLoss,
            takeProfit: takeProfit,
        };
    }

    return null;
}
// Hàm kiểm tra tất cả các điều kiện ICT
// function checkICTConditions(price, historicalData) {
//     // Kiểm tra Liquidity Pools
//     const liquiditySignal = identifyLiquidityPools(price, historicalData);
//     if (liquiditySignal) {
//         return liquiditySignal;
//     }
//
//     // Kiểm tra Order Blocks
//     const orderBlockSignal = identifyOrderBlocks(price, historicalData);
//     if (orderBlockSignal) {
//         return orderBlockSignal;
//     }
//
//     // Kiểm tra Fair Value Gaps
//     const fvgSignal = identifyFairValueGap(price, historicalData);
//     if (fvgSignal) {
//         return fvgSignal;
//     }
//
//     return null;
// }
// Hàm gửi thông báo đến Telegram khi có tín hiệu
async function notifyTelegram(chatId, message) {
    try {
        await bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Lỗi khi gửi tin nhắn Telegram:', error);
    }
}

// Xử lý lệnh /start từ người dùng Telegram
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Chào mừng! Bot sẽ thông báo khi có tín hiệu ICT.');
});

async function getHistoricalData(symbol) {
    const endpoint = 'https://api.binance.com/api/v3/klines';
    const params = {
        symbol: symbol,
        interval: '5m', // Thời gian nến 1 phút
        limit: 50, // Lấy 10 cây nến gần nhất
    };

    try {
        const response = await axios.get(endpoint, { params });
        // Trả về các đối tượng nến với giá open, high, low, close
        return response.data.map(candle => ({
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
        }));
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu nến lịch sử:', error);
    }
}
// Lặp lại kiểm tra giá liên tục (mỗi phút)
setInterval(async () => {
    const symbol = 'WLDUSDT'; // Ví dụ với cặp BTC/USDT
    const price = await getPrice(symbol); // Lấy giá hiện tại
    const historicalData = await getHistoricalData(symbol); // Lấy dữ liệu nến
    if (price) {
        const signal = checkICTConditions(price, historicalData);
        if (signal) {
            // Gửi thông báo đến tất cả người dùng đã đăng ký
            notifyTelegram('-4578785246', `Tín hiệu ICT cho ${symbol}: ${signal}`);
        }
    }
}, 300000); // Lặp lại mỗi 5 phút
