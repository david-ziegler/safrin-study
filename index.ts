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

let accessToken = "";
let refreshToken = "";

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

app.get("/authorize", (req: Request, res: Response) => {
  res.redirect(client.getAuthorizeUrl("sleep heartrate", OUR_SERVER_URL));
});

// handle the callback from the Fitbit authorization flow
app.get("/", (req, res) => {
  // exchange the authorization code we just received for an access token
  client
    .getAccessToken(req.query.code, OUR_SERVER_URL)
    .then(async (result: any) => {
      console.log("User granted authorization:", result);
      try {
        const userId = result.user_id;
        accessToken = result.access_token;
        refreshToken = result.refresh_token;

        res.send(
          `Vielen Dank! Die Autorisierung war erfolgreich. Bitte geben Sie folgende User-ID im Teilnahmeformular ein: 
          ${userId}`
        );
      } catch (error: any) {
        res.status(error.status).send(error);
      }
    })
    .catch((error: any) => {
      res.status(error.status).send(error);
    });
});

app.get("/write-data", async (req, res) => {
  console.log("Retrieving data...");
  try {
    const sleep = await client.get(
      "/sleep/date/2023-10-30/2024-01-31.json",
      accessToken
    );

    writeToCsv(sleep[0].sleep);

    res.send("Data written successfully");
    console.log("Data written successfully");
  } catch (error: any) {
    res.status(error.status).send(error);
  }
});

function writeToCsv(data: any) {
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
  const filename = "./output/sleep.csv";
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}
