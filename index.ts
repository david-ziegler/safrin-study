import express, { Request, Response } from "express";
const FitbitApiClient = require("fitbit-node");
import dotenv from "dotenv";
import * as fs from "fs";
import https from "https";

dotenv.config();
const {
  FITBIT_CLIENT_ID,
  FITBIT_CLIENT_SECRET,
  FITBIT_API_VERSION,
  OUR_SERVER_URL,
  USE_HTTPS,
  START_DATE,
} = process.env;

const app = express();

console.log("Starting...");
console.log(`Fitbit API version: ${FITBIT_API_VERSION}`);
console.log(`Fitbit client ID: ${FITBIT_CLIENT_ID}`);

const client = new FitbitApiClient({
  clientId: FITBIT_CLIENT_ID,
  clientSecret: FITBIT_CLIENT_SECRET,
  apiVersion: FITBIT_API_VERSION,
});

if (USE_HTTPS === "true") {
  const sslOptions = {
    key: fs.readFileSync("/etc/ssl/private/server-key_nopass.pem"),
    cert: fs.readFileSync(
      "/etc/ssl/certs/vm188165-lw_hosting_uni-hannover_de.pem"
    ),
  };

  https.createServer(sslOptions, app).listen(3001, () => {
    console.log(
      `Server is running with HTTPS. Go to ${OUR_SERVER_URL}/authorize`
    );
  });
} else {
  app.listen(3001);
  console.log(
    `Server is running without HTTPS. Go to ${OUR_SERVER_URL}/authorize`
  );
}

// Initial entry point
app.get("/authorize", (req: Request, res: Response) => {
  res.redirect(client.getAuthorizeUrl("sleep heartrate", OUR_SERVER_URL));
});

// Handle the callback from the Fitbit authorization flow
app.get("/", (req, res) => {
  // exchange the authorization code we just received for an access token
  client
    .getAccessToken(req.query.code, OUR_SERVER_URL)
    .then(async (result: any) => {
      console.log("User granted authorization:", result);
      try {
        const userId = result.user_id;
        const refreshToken = result.refresh_token;

        // Persist refresh token for future use
        writeRefreshToken(userId, refreshToken);

        res.send(
          `Vielen Dank! Die Autorisierung war erfolgreich. Bitte geben Sie folgende User-ID im Teilnahmeformular ein: 
          ${userId}`
        );
      } catch (error: any) {
        console.error(error);
        res.status(500).send("An error occurred");
      }
    })
    .catch((error: any) => {
      console.error(error);
      res.status(500).send("An error occurred");
    });
});

app.get("/write-data", async (req, res) => {
  console.log("/write-data");

  try {
    console.log("Read existing refresh tokens");
    const userIds = fs.readdirSync(`./data/refresh-tokens`);
    console.log(userIds);

    // For each user that granted authorization:
    for (const userId of userIds) {
      // Refresh Access Token
      const refreshToken = fs.readFileSync(
        `./data/refresh-tokens/${userId}`,
        "utf-8"
      );
      console.log(`RefreshToken: ${refreshToken}, userId: ${userId}`);
      const result = await client.refreshAccessToken("", refreshToken);
      const newRefreshToken = result.refresh_token;
      const newAccessToken = result.access_token;
      console.log("UserId:", userId);

      // Write refresh token to file for future requests
      writeRefreshToken(userId, newRefreshToken);
      console.log("Refreshed access token:", result);

      // Retrieve sleep data for this user
      const sleep = await client.get(
        `/sleep/date/${START_DATE}/${getTodayDateString()}.json`,
        newAccessToken
      );
      writeToCsv(sleep[0].sleep, userId);
    }

    res.send("Data written successfully");
  } catch (error: any) {
    console.error(error);
    res.status(500).send("An error occurred");
  }
});

function writeRefreshToken(userId: string, refreshToken: string) {
  fs.writeFileSync(`./data/refresh-tokens/${userId}`, refreshToken);
}

function writeToCsv(data: any, userId: string) {
  // Prepare data
  const headers = [
    "dateOfSleep",
    "timeInBed",
    "minutesAsleep",
    "minutesAwake",
    "minutesToFallAsleep",
    "efficiency",
    "deep: count",
    "deep: minutes",
    "deep: thirtyDayAvgMinutes",
    "light: count",
    "light: minutes",
    "light: thirtyDayAvgMinutes",
    "rem: count",
    "rem: minutes",
    "rem: thirtyDayAvgMinutes",
    "wake: count",
    "wake: minutes",
    "wake: thirtyDayAvgMinutes",
    "asleep: count",
    "asleep: minutes",
    "restless: count",
    "restless: minutes",
  ];
  let csv = `${headers.join(",")}\n`;
  data.forEach((row: any) => {
    const stages = row.levels.summary;
    csv += `${row.dateOfSleep},${row.timeInBed},${row.minutesAsleep},${row.minutesAwake},${row.minutesToFallAsleep},${row.efficiency},${stages.deep?.count},${stages.deep?.minutes},${stages.deep?.thirtyDayAvgMinutes},${stages.light?.count},${stages.light?.minutes},${stages.light?.thirtyDayAvgMinutes},${stages.rem?.count},${stages.rem?.minutes},${stages.rem?.thirtyDayAvgMinutes},${stages.wake?.count},${stages.wake?.minutes},${stages.wake?.thirtyDayAvgMinutes},${stages.asleep?.count},${stages.asleep?.minutes},${stages.restless?.count},${stages.restless?.minutes}\n`;
  });

  // Write file
  const dateString = getTodayDateString();
  const folder = `./data/sleep/${userId}`;
  fs.mkdirSync(folder, { recursive: true }); // `recursive` is necessary to do nothing if the folder already exists
  const filename = `${folder}/${dateString}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}

function getTodayDateString(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  return `${now.getFullYear()}-${month
    .toString()
    .padStart(2, "0")}-${now.getDate()}`;
}
