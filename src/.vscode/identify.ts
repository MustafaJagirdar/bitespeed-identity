import { Request, Response } from "express";
import { identifyContact } from "../services/identityService";

export function identifyHandler(req: Request, res: Response): void {
  try {
    const body = req.body;

    // Grab email and phone from the request
    const email = body.email ?? null;
    const phoneNumber = body.phoneNumber ? String(body.phoneNumber) : null;

    // At least one must be provided
    if (!email && !phoneNumber) {
      res.status(400).json({
        error: "Please provide at least one of email or phoneNumber.",
      });
      return;
    }

    const result = identifyContact({ email, phoneNumber });
    res.status(200).json(result);
  } catch (err: any) {
    console.error("Error in /identify:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
}