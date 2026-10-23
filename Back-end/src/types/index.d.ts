declare namespace Express {
  export interface Request {
    user?: { id: string; userId: string; email: string; sid?: string };
    rawBody: any;
  }
}
