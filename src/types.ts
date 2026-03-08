// This describes what a Contact row looks like in the database
export interface Contact {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: "primary" | "secondary";
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }
  
  // This describes what comes IN to our API
  export interface IdentifyRequest {
    email?: string | null;
    phoneNumber?: string | null;
  }
  
  // This describes what goes OUT from our API
  export interface IdentifyResponse {
    contact: {
      primaryContatctId: number;
      emails: string[];
      phoneNumbers: string[];
      secondaryContactIds: number[];
    };
  }