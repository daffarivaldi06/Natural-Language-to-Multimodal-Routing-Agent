export interface AuthRegisterBody {
  email: string;
  password: string;
}

export interface AuthLoginBody {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  token: string;
  expiresIn: string;
  role: "USER" | "ADMIN";
}
