const { RETRY_COUNT, RETRY_INTERVAL, FIRST_REQUEST_INTERVAL, DRIVER_ADD, delay } = require("./global");

const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { init: initDB, Counter } = require("./db");
const logger = morgan("tiny");
const request = require('request');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 首页
app.get("/", async (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// // 更新计数
// app.post("/api/count", async (req, res) => {
//   const { action } = req.body;
//   if (action === "inc") {
//     await Counter.create();
//   } else if (action === "clear") {
//     await Counter.destroy({
//       truncate: true,
//     });
//   }
//   res.send({
//     code: 0,
//     data: await Counter.count(),
//   });
// });
//
// // 获取计数
// app.get("/api/count", async (req, res) => {
//   const result = await Counter.count();
//   res.send({
//     code: 0,
//     data: result,
//   });
// });

// 小程序调用，获取微信 Open ID
app.get("/api/wx_openid", async (req, res) => {
  if (req.headers["x-wx-source"]) {
    res.send(req.headers["x-wx-openid"]);
  }
});

// 需要使用 body-parser 处理 JSON 数据
// 小程序调用，获取获取用户手机号
app.post('/api/phone', async (req, res) => {
  // 拼接 Header 中的 x-wx-openid 到接口中
  const api = `http://api.weixin.qq.com/wxa/getopendata?openid=${req.headers['x-wx-openid']}`;
  request(api, {
    method: 'POST',
    body: JSON.stringify({
      cloudid_list: [req.body.cloudid], // 传入需要换取的 CloudID
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  }, (err, resp, body) => {
    try {
      const data = JSON.parse(body).data_list[0]; // 从回包中获取手机号信息
      const phone = JSON.parse(data.json).data.phoneNumber;
      // 将手机号发送回客户端，此处仅供示例
      // 实际场景中应对手机号进行打码处理，或仅在后端保存使用
      res.send(phone);
    } catch (error) {
      res.send('get phone failed');
    }
  });
});

const addDriver = async (api, params, attempt = 1, res) => {
  if (attempt > RETRY_COUNT) {
    return;
  }

  const timestamp = new Date().getTime(); // 获取时间戳
  const timeString = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(attempt + " 报名中.. " + timeString + " 时间戳: " + timestamp);

  request(api, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json',
    },
  }, async (err, resp, body) => {
    console.log("attempt:" + attempt + " resp:" + JSON.stringify(resp));
    console.log("attempt:" + attempt + " body:" + JSON.stringify(body));
    console.log("attempt:" + attempt + " err:" + JSON.stringify(err));
    const resultData = JSON.parse(body);
    const { msg, code } = resultData;
    if (err || code !== 0) {
      await delay(RETRY_INTERVAL);
      addDriver(api, params, attempt + 1, res);
    } else {
      //成功
    }
  });
};

//货单预定接口
//首先检查当前时间是否已经达到 startTime。如果已经达到或超过，我们立即调用 requestOpenData 函数来执行请求。如果还没有到达，我们使用 setTimeout 设置一个延迟，延迟时间是 startTime 与当前时间的差值。
//requestOpenData 函数是一个递归函数，它会尝试请求微信的接口，如果请求失败或遇到错误，它会通过 setTimeout 在1秒后重试，最多重试30次。每次重试都会增加 attempt 参数的计数。如果请求成功，它会尝试解析手机号并将其发送回客户端。如果解析失败，它也会重试，直到成功或达到最大尝试次数。
app.post("/api/book", async (req, res) => {
  const openId = req.headers["x-wx-source"];
  const api = DRIVER_ADD;
  const { startTime } = req.body;
  let params = {
    openId,
    ...req.body
  };

  const currentTime = new Date().getTime();
  const waitTime = new Date(startTime).getTime() - currentTime;
  console.log(openId + " waitTime:" + waitTime + " currentTime:" + currentTime);
  if (waitTime <= 0) {
    res.send('正在报名中...');
    addDriver(api, params, 1, res);
  } else {
    console.log("openId:" + openId + ' 预定请求已接收，正在处理中... ' + " waitTime:" + waitTime + " currentTime:" + currentTime);
    res.send('预定请求已接收，正在处理中...');
    // 等待预定时间到达后再执行预定操作
    await delay(waitTime + FIRST_REQUEST_INTERVAL);
    addDriver(api, params, 1, res);
  }
});

app.post("/api/check", async (req, res) => {
  const openId = req.headers["x-wx-source"]
  const api = DRIVER_ADD;
  let params = {
    openId,
    ...req.body
  }
  request(api, {
    method: 'POST',
    body: JSON.stringify(params),
    headers: {
      'Content-Type': 'application/json',
    },
  }, (err, resp, body) => {
    console.log("checkIsAddDriver_resp:" + JSON.stringify(resp));
    console.log("checkIsAddDriver_body:" + JSON.stringify(body));
    console.log("checkIsAddDriver_err:" + JSON.stringify(err));
    const resultData = JSON.parse(body);
    const { msg } = resultData;
    res.send(msg);
  });
});


const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
