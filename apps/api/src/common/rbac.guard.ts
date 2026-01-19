import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export enum RoleLevel {
  CEO = 100,
  SUPERVISOR = 50,
  STAFF = 10,
}

export interface RbacOptions {
  minLevel?: number;
  maxLevel?: number;
  sameDepartment?: boolean;
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const rbac: RbacOptions = this.reflector.get<RbacOptions>('rbac', context.getHandler()) || {};
    const user = request.user;
    if (!user) throw new ForbiddenException('No user in request');
    // Check minLevel
    if (rbac.minLevel && user.nivelAutoridad < rbac.minLevel) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    // Check maxLevel
    if (rbac.maxLevel && user.nivelAutoridad > rbac.maxLevel) {
      throw new ForbiddenException('No tienes permisos para esta acción');
    }
    // Check sameDepartment
    if (rbac.sameDepartment && request.body && request.body.departamentoId) {
      if (user.departamentoId !== request.body.departamentoId) {
        throw new ForbiddenException('Solo puedes gestionar tu propio departamento');
      }
    }
    return true;
  }
}

// Decorator for easy usage
import { SetMetadata } from '@nestjs/common';
export const RBAC = (options: RbacOptions) => SetMetadata('rbac', options);
