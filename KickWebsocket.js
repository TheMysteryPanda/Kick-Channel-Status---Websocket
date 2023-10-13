#!/usr/bin/env node

const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');

// Load SSL/TLS certificates from Certbot
const options = {
  cert: fs.readFileSync('/home/newusername/certificates/fullchain.pem'),
  key: fs.readFileSync('/home/newusername/certificates/privkey.pem'),
};

// Create the HTTPS server using the loaded certificates
const server = https.createServer(options);

const wss = new WebSocket.Server({ server }); // Pass the 'server' option here

async function fetchData(channelId) {
  try {
    const browser = await puppeteer.launch({
      args: puppeteer.defaultArgs(),
      headless: 'new',
      ignoreDefaultArgs: ["--disable-extensions", "--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0');

    const channelUrl = `https://kick.com/api/v1/channels/${channelId}`;

    // Fetch channel ID using channel name
    await page.goto(channelUrl);
    const data = await page.evaluate(() => {
      return JSON.parse(document.body.innerText);
    });

    // Get the data out of the json
    const channelID = data.id;
    const followersCount = data.followersCount;
    const { livestream } = data;
    const livestreamStatus = livestream ? (livestream.is_live ? "Online" : "Offline") : "Offline";
    const viewersCount = livestream ? livestream.viewer_count : 0;

    // Extract the profile picture URL from the user information
    const user = data.user;
    const profilePic = user && user.profile_pic ? user.profile_pic : null;


    // Extract the chatroom informations
    const chatroom = data.chatroom;
    const followersOnly = chatroom && chatroom.followers_mode ? chatroom.followers_mode : false;
    const subscriberOnly = chatroom && chatroom.subscribers_mode ? chatroom.subscribers_mode : false;

    
    // Fetch messages using the obtained channel ID
    const messagesUrl = `https://kick.com/api/v2/channels/${channelID}/messages`;
    await page.goto(messagesUrl);
    const messagesData = await page.evaluate(() => {
      return JSON.parse(document.body.innerText);
    });

    await browser.close();

    // Extract the messages array from messagesData.data
    const messages = messagesData.data.messages;

    return { followersCount, livestreamStatus, viewersCount, messages, profilePic, followersOnly, subscriberOnly };
  } catch (error) {
    console.error('Error fetching data:', error);
    return null;
  }
}

// Function to fetch data from the WebSocket server and send it to the client
async function fetchAndSendData(ws) {
  try {
    if (!ws.channelName) {
      return;
    }

    const data = await fetchData(ws.channelName);
    ws.send(JSON.stringify(data));
  } catch (error) {
    console.error('WebSocket Error:', error);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (channelName) => {
    const channelNameStr = channelName.toString();
    ws.channelName = channelNameStr;

    // Send the initial data to the connected client
    fetchAndSendData(ws);
    console.log('WebSocket connected to channel:', channelNameStr);
  });
});


// Fetch data from the WebSocket server every second
setInterval(() => {
  wss.clients.forEach((client) => {
    fetchAndSendData(client);
  });
}, 1000);

// Start the HTTPS server
const port = 8081;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});