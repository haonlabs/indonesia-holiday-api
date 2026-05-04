import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { errorMiddleware } from "./middleware/error.middleware";
import { adminRouter } from "./routes/admin.routes";
import { holidayRouter } from "./routes/holiday.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(
  pinoHttp({
    logger,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/holidays", holidayRouter);
app.use("/admin", adminRouter);
app.use(errorMiddleware);
