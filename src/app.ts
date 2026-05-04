import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { adminRouter } from "./routes/admin.routes";
import { holidayRouter } from "./routes/holiday.routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { logger } from "./lib/logger";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(
  pinoHttp({
    logger
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/holidays", holidayRouter);
app.use("/admin", adminRouter);
app.use(errorMiddleware);
