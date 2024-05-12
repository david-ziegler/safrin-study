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

const API_VERSION_HEART_RATE = 1;
const clientHeartRate = new FitbitApiClient({
  clientId: FITBIT_CLIENT_ID,
  clientSecret: FITBIT_CLIENT_SECRET,
  apiVersion: API_VERSION_HEART_RATE,
});

const API_VERSION_SLEEP = 1.2;
const clientSleep = new FitbitApiClient({
  clientId: FITBIT_CLIENT_ID,
  clientSecret: FITBIT_CLIENT_SECRET,
  apiVersion: API_VERSION_SLEEP,
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
  res.redirect(clientSleep.getAuthorizeUrl("sleep heartrate", OUR_SERVER_URL));
});

// Handle the callback from the Fitbit authorization flow
app.get("/", (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.error(`Error in redirect endpoint: code=${code}`);
    return res
      .status(400)
      .send(`Please go to ${OUR_SERVER_URL}/authorize first`);
  }

  // Exchange the authorization code we just received for an access token
  clientSleep
    .getAccessToken(code, OUR_SERVER_URL)
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
        printError(
          "Error in redirect endpoint `/` while writing refresh tokens",
          error
        );
        res.status(500).send("An error occurred");
      }
    })
    .catch((error: any) => {
      printError(
        `Error in redirect endpoint while calling getAccessToken() with code=${req.query.code}`,
        error
      );
      res.status(500).send("An error occurred");
    });
});

app.get("/nucleus-repeat-cowbell/write-data", async (req, res) => {
  console.log("/write-data");

  try {
    console.log("Existing refresh tokens:");
    const userIds = fs.readdirSync(`./data/refresh-tokens`);
    console.log(userIds);

    if (START_DATE === undefined || START_DATE?.length === 0) {
      console.error("Environment variable START_DATE is not defined");
    } else {
      const endDate30daysLater = calculate30DaysFromDate(START_DATE);
      const endDate100daysLater = calculate100DaysFromDate(START_DATE);

      const errorUserIds = [];
      const successUserIds = [];

      // For each user that granted authorization:
      for (const userId of userIds) {
        // Refresh Access Token
        const refreshToken = fs.readFileSync(
          `./data/refresh-tokens/${userId}`,
          "utf-8"
        );

        const sleepDataUrl = `/sleep/date/${START_DATE}/${endDate100daysLater}.json`;
        const hrvUrl = `/hrv/date/${START_DATE}/${endDate30daysLater}.json`;
        const heartRateUrl = `/activities/heart/date/${START_DATE}/${endDate30daysLater}.json`;
        console.log(
          `RefreshToken: ${refreshToken}, userId: ${userId}, URLs: ${sleepDataUrl}, ${hrvUrl}, ${heartRateUrl}`
        );
        try {
          console.log("UserId:", userId);
          console.log("Refresh access token...");
          const result = await clientSleep.refreshAccessToken("", refreshToken);

          // Write refresh token to file for future requests
          writeRefreshToken(userId, result.refresh_token);

          // Retrieve sleep data for this user
          console.log("Fetch sleep data: ", sleepDataUrl);
          const sleep = await clientSleep.get(
            sleepDataUrl,
            result.access_token
          );
          if (sleep[0].sleep === undefined) {
            throw new Error(
              `Error: sleep[0].sleep === 'undefined': ${sleepDataUrl}`
            );
          }
          writeSleepToCsv(sleep[0].sleep, userId);

          console.log("Fetch hrv data: ", hrvUrl);
          const hrv = await clientHeartRate.get(hrvUrl, result.access_token);
          writeHrvToCsv(hrv[0].hrv, userId);

          console.log("Fetch heart rate data: ", heartRateUrl);
          const heartRate = await clientHeartRate.get(
            heartRateUrl,
            result.access_token
          );
          writeHeartRateToCsv(heartRate[0]["activities-heart"], userId);

          successUserIds.push(userId);
        } catch (error: any) {
          printError(
            `Error while trying to retrieve or write data for user ${userId}. This user will be skipped.`,
            error
          );
          errorUserIds.push(userId);
        }
      }

      res.send(
        `Data written successfully:
        Start: ${START_DATE}, End: ${endDate100daysLater} --- User IDs: ${successUserIds.join(
          ", "
        )} --- Users with error: ${errorUserIds.join(", ")}`
      );
    }
  } catch (error: any) {
    printError("Error in /write-data", error);
    res.status(500).send("An error occurred");
  }
});

function printError(message: string, error: any) {
  console.error(`${message}: ${JSON.stringify(error, null, 2)}`);
}

function writeRefreshToken(userId: string, refreshToken: string) {
  fs.writeFileSync(`./data/refresh-tokens/${userId}`, refreshToken);
}

function writeSleepToCsv(data: any, userId: string) {
  // Prepare data
  const headers = [
    "dateOfSleep",
    "duration",
    "efficiency",
    "endTime",
    "infoCode",
    "isMainSleep",
    "logId",
    "minutesAfterWakeup",
    "minutesAsleep",
    "minutesAwake",
    "minutesToFallAsleep",
    "logType",
    "startTime",
    "timeInBed",
    "type",
    "levels : data : dateTime",
    "levels : data : level",
    "levels : data : seconds",
    "levels : shortData : dateTime",
    "levels : shortData : level",
    "levels : shortData : seconds",
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
    csv += `${row.dateOfSleep},${row.duration},${row.efficiency},${row.endTime},${row.infoCode},${row.isMainSleep},${row.logId},${row.minutesAfterWakeup},${row.minutesAsleep},${row.minutesAwake},${row.minutesToFallAsleep},${row.logType},${row.startTime},${row.timeInBed},${row.type},${row.levels.data.dateTime},${row.levels.data.level},${row.levels.data.seconds},${row.levels.shortData.dateTime},${row.levels.shortData.level},${row.levels.shortData.seconds},${stages.deep?.count},${stages.deep?.minutes},${stages.deep?.thirtyDayAvgMinutes},${stages.light?.count},${stages.light?.minutes},${stages.light?.thirtyDayAvgMinutes},${stages.rem?.count},${stages.rem?.minutes},${stages.rem?.thirtyDayAvgMinutes},${stages.wake?.count},${stages.wake?.minutes},${stages.wake?.thirtyDayAvgMinutes},${row.asleep?.count},${row.asleep?.minutes},${row.restless?.count},${row.restless?.minutes}\n`;
  });

  // Write file
  const dateString = getTodayDateString();
  const folder = `./data/sleep/${userId}`;
  fs.mkdirSync(folder, { recursive: true }); // `recursive` is necessary to do nothing if the folder already exists
  const filename = `${folder}/${dateString}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}

function writeHrvToCsv(data: any, userId: string) {
  // Prepare data
  const headers = ["dateTime", "dailyRmssd", "deepRmssd"];
  let csv = `${headers.join(",")}\n`;
  data.forEach((row: any) => {
    csv += `${row.dateTime},${row.value.dailyRmssd},${row.value.deepRmssd}\n`;
  });

  // Write file
  const dateString = getTodayDateString();
  const folder = `./data/hrv/${userId}`;
  fs.mkdirSync(folder, { recursive: true }); // `recursive` is necessary to do nothing if the folder already exists
  const filename = `${folder}/${dateString}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`Wrote file to ${filename}`);
}

function writeHeartRateToCsv(data: any, userId: string) {
  // Prepare data
  const headers = [
    "datetime",
    "Out of Range : caloriesOut",
    "Out of Range : max",
    "Out of Range : min",
    "Out of Range : minutes",
    "Out of Range : name",
    "Fat Burn : caloriesOut",
    "Fat Burn : max",
    "Fat Burn : min",
    "Fat Burn : minutes",
    "Fat Burn : name",
    "Cardio : caloriesOut",
    "Cardio : max",
    "Cardio : min",
    "Cardio : minutes",
    "Cardio : name",
    "Peak : caloriesOut",
    "Peak : max",
    "Peak : min",
    "Peak : minutes",
    "Peak : name",
    "restingHeartRate",
  ];
  let csv = `${headers.join(",")}\n`;
  data.forEach((row: any) => {
    const zones = row.value.heartRateZones;
    csv += `${row.dateTime},${zones[0].caloriesOut},${zones[0].max},${zones[0].min},${zones[0].minutes},${zones[0].name},${zones[1].caloriesOut},${zones[1].max},${zones[1].min},${zones[1].minutes},${zones[1].name},${zones[2].caloriesOut},${zones[2].max},${zones[2].min},${zones[2].minutes},${zones[2].name},${zones[3].caloriesOut},${zones[3].max},${zones[3].min},${zones[3].minutes},${zones[3].name},${row.value.restingHeartRate}\n`;
  });

  // Write file
  const dateString = getTodayDateString();
  const folder = `./data/heartRate/${userId}`;
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

function calculate30DaysFromDate(inputDate: string) {
  var date = new Date(inputDate);
  date.setDate(date.getDate() + 30);
  var resultDate = date.toISOString().split("T")[0];

  return resultDate;
}

function calculate100DaysFromDate(inputDate: string) {
  var date = new Date(inputDate);
  date.setDate(date.getDate() + 100);
  var resultDate = date.toISOString().split("T")[0];

  return resultDate;
}
