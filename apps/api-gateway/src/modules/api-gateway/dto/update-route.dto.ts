import { PartialType } from '@nestjs/swagger';
import { CreateRouteDto } from './create-route.dto';

/**
 * DTO for updating an API route (all fields optional)
 */
export class UpdateRouteDto extends PartialType(CreateRouteDto) {}
