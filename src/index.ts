import express from "express";
import { initDb } from "./db";
import { identifyHandler } from "./handlers/identify";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Bitespeed Identity API is running!" });
});

app.post("/identify", identifyHandler);

const PORT = process.env.PORT || 3000;

initDb();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;