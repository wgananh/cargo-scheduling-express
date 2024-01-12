const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量中读取数据库配置
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("nodejs_demo", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql" /* one of 'mysql' | 'mariadb' | 'postgres' | 'mssql' */,
});

// 定义数据模型
const Counter = sequelize.define("Counter", {
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
});

// 定义WebSocket连接状态的数据模型
const WebSocketConnection = sequelize.define("WebSocketConnection", {
  openid: {
    type: DataTypes.STRING,
    allowNull: false,
    primaryKey: true,
  },
  isConnected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  lastConnectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '非微信',
  },
  unionid: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '-',
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '未知',
  },
  // ... 其他可能的字段 ...
});

// 数据库初始化方法
async function init() {
  await Counter.sync({ alter: true });
  await WebSocketConnection.sync({ alter: true });
}

// 导出初始化方法和模型
module.exports = {
  init,
  Counter,
  WebSocketConnection,
};
