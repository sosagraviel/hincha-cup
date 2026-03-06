import { IsEmail, IsString } from "class-validator";

export class InviteUserResponseDto {
  @IsString()
  username: string;

  @IsEmail()
  email: string;

  constructor(partial: Partial<InviteUserResponseDto>) {
    Object.assign(this, partial);
  }
}
