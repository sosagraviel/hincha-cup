import {
  BaseResponseDto,
  PaginatedResponseDto,
  PaginationMeta,
} from '../../base';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserStatus } from '../../enums';

export class UserResponseDto extends BaseResponseDto {
  @IsString()
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  profilePictureUrl?: string | null;

  @Transform(({ value }) => (value ? ('' + value).toUpperCase() : value))
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  constructor(partial: Partial<UserResponseDto>) {
    super();
    Object.assign(this, partial);
  }
}

export class UserPaginatedResponseDto extends PaginatedResponseDto<UserResponseDto> {
  readonly data: readonly UserResponseDto[];

  constructor(props: { data: UserResponseDto[]; pagination: PaginationMeta }) {
    super(props);
    this.data = props.data;
  }
}
