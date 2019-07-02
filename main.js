/* eslint-disable no-loop-func */

const Rcon = require('rcon');
const env = require('dotenv').config();
const logReceiver = require('srcds-log-receiver');
const Discord = require('discord.js');
const dgram = require('dgram');
const OSC = require('osc-js');
const http = require('http');

// Comparison strings from logs
const techPauseString = '.tech';
const freezeStartString = 'Starting Freeze period';
const roundStartString = 'World triggered "Round_Start';

let freezeTime = false;
const gamePause = false;

const client = new Discord.Client();

// Connecting to discord
client.login(process.env.TOKEN); // Login with preset discord token in the .env file

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});


const receiveroptions = {
  port: process.env.PORT,
};

const receiver = new logReceiver.LogReceiver(receiveroptions);

const rconSend = (data) => {
  const ip = 'ip';
  const port = 'port';
  const password = 'password';

  const rconclient = new Rcon(ip, port, password);
  rconclient.connect();

  rconclient.on('auth', async () => {
    rconclient.send(data);
  });

  rconclient.on('error', async (err) => {
    console.log(err);
  });
};


// add yourself to the game server logs
rconSend(`logaddress_add LOCALIP:${process.env.PORT}`);


// handles the chat pauses
receiver.on('data', (data) => {
  if (!data) return;
  if (data.message.includes(freezeStartString)) {
    freezeTime = true;
  }

  if (data.message.includes(roundStartString) && freezeTime === true) {
    freezeTime = false;
  }

  if (data.message.toLowerCase().includes(techPauseString) && freezeTime === true && gamePause === false) {
    // sending to a discord user for pause notifications
    client.users.get(process.env.DISCORD_ID).send('Tech pause');

    rconSend('mp_pause_match');
    rconSend('say TECH PAUSE CALLED - PUT YOUR HAND UP IF YOU HAVE AN ISSUE');
  }
});


let coachMute = false;
let playerMute = false;


const socket = dgram.createSocket('udp4');

// osc commands need to be binary
const toBinary = (osc) => {
  const binary = osc.pack();
  return binary;
};

const setOSC = (oscPath, oscMessage) => {
  try {
    // osc ips
    const Ip1 = '1.1.1.1';
    const Ip2 = '1.1.1.1';
    const Port = '22222';
    const osc = new OSC.Message(`${oscPath}`, oscMessage);

    const binary = toBinary(osc);
    socket.send(new Buffer(binary), 0, binary.byteLength, Port, Ip1);
    socket.send(new Buffer(binary), 0, binary.byteLength, Port, Ip2);
  } catch (error) {
    //
  }
};

const handleData = (data) => {
  try {
    if (data.map.phase === 'intermission' || data.phase_countdowns.phase === 'timeout_t' || data.phase_countdowns.phase === 'timeout_ct' || data.phase_countdowns.phase === 'warmup') {
      if (coachMute === true) {
        setOSC('/config/mute/2', 0);
        coachMute = false;
      }
    }

    if (coachMute === false) {
      if (data.map.phase !== 'intermission' && data.phase_countdowns.phase !== 'timeout_t' && data.phase_countdowns.phase !== 'timeout_ct' && data.phase_countdowns.phase !== 'warmup') {
        setOSC('/config/mute/2', 1);
        coachMute = true;
      }
    }

    if (data.phase_countdowns.phase === 'paused' && playerMute === false) {
      setOSC('/config/mute/1', 1);
      setOSC('/config/mute/2', 1);
      playerMute = true;
      coachMute = true;
    }

    if (data.phase_countdowns.phase !== 'paused' && playerMute) {
      setOSC('/config/mute/1', 0);
      playerMute = false;
    }


    if (data.map.phase === 'gameover' && (coachMute === true || playerMute === true)) {
      setOSC('/config/mute/1', 0);
      setOSC('/config/mute/2', 0);
    }
  } catch (error) {
    //
  }
  console.clear();
  if (coachMute === false) {
    console.log('Coach ✅');
  } else {
    console.log('Coach ❌');
  }

  if (playerMute === false) {
    console.log('Player ✅');
  } else {
    console.log('Player ❌');
  }
};

// listening to port for incoming game data
const server = http.createServer((req, res) => {
  res.writeHead(200);

  if (req.method === 'POST') {
    let data; let body; const
      buffer = [];

    req.on('data', (datain) => {
      buffer.push(datain);
    });

    req.on('end', () => {
      body = Buffer.concat(buffer);
      data = JSON.parse(body);

      handleData(data);
    });
  }
  res.end();
});


// csgo client
server.listen('7676', '172.30.9.71');

// osc commands
setOSC('/config/mute/1', 0);
setOSC('/config/mute/2', 0);

console.clear();

console.log('Coach ✅');
console.log('Player ✅');
