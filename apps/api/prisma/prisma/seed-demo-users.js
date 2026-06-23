"use strict";
/**
 * Seed de usuarios demo NEXARA — equipo real + 1 usuario por cada rol nuevo.
 *
 * Crea/actualiza:
 *  - 13 plantillas ORG_ROLE_TEMPLATES (Roles)
 *  - Departamentos (Dirección General, Ventas, Operaciones, Administración…)
 *  - 1 usuario real por cada rol del ERP tech-services
 *  - Password universal demo: "Nexara2026!" (cambiar en producción)
 *
 * Es idempotente: puede correrse N veces sin duplicar nada.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/seed-demo-users.ts
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var bcrypt = __importStar(require("bcryptjs"));
var org_roles_1 = require("../src/common/org-roles");
var prisma = new client_1.PrismaClient();
var DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Nexara2026!';
var DEMO_PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 10);
/**
 * Equipo NEXARA real + 1 usuario por rol nuevo.
 *
 * Los emails marcados con (real) ya viven en seed-onboarding-demo.ts y se usan
 * para vincular procesos, tickets, viáticos, etc.
 */
var DEMO_USERS = [
    // ── Dirección General ─────────────────────────────────────────────────
    {
        nombre: 'Christian Del Pozo',
        email: 'gerencia@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.CEO,
        departmentName: 'Dirección General',
        employeeNumber: 'NX-001',
    },
    {
        nombre: 'Adam Del Pozo',
        email: 'developer@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.CEO, // dev con permisos plenos
        departmentName: 'Dirección General',
        employeeNumber: 'NX-002',
    },
    // ── Direcciones ───────────────────────────────────────────────────────
    // Karen consolida Dirección Comercial + Dirección Administrativa
    // (los poderes de Lizeth se le transfirieron en su totalidad).
    {
        nombre: 'Luis Joel Aguilar',
        email: 'direccion.operaciones@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.DIRECTOR_OPS,
        departmentName: 'Operaciones',
        employeeNumber: 'NX-020',
    },
    {
        nombre: 'Karen Elizalde',
        email: 'ventas@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.DIRECTOR_ADMIN,
        departmentName: 'Ventas',
        employeeNumber: 'NX-030',
    },
    // ── Mandos medios ─────────────────────────────────────────────────────
    {
        nombre: 'Alejandro Gonzales',
        email: 'operaciones@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.PROJECT_MANAGER,
        departmentName: 'Operaciones',
        employeeNumber: 'NX-040',
    },
    {
        nombre: 'Mariana Cervantes',
        email: 'gerencia.ventas@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.SALES_MANAGER,
        departmentName: 'Ventas',
        employeeNumber: 'NX-041',
    },
    {
        nombre: 'Roberto Salinas',
        email: 'almacen@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.WAREHOUSE_MANAGER,
        departmentName: 'Almacén',
        employeeNumber: 'NX-042',
    },
    {
        nombre: 'Sofía Madrigal',
        email: 'mantenimiento@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.MAINTENANCE_COORDINATOR,
        departmentName: 'Operaciones',
        employeeNumber: 'NX-043',
    },
    {
        nombre: 'Diego Acosta',
        email: 'noc.lead@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.NOC_LEAD,
        departmentName: 'NOC',
        employeeNumber: 'NX-044',
    },
    // ── Especialistas ─────────────────────────────────────────────────────
    {
        nombre: 'Carolina Juárez',
        email: 'soporte@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.SENIOR_ENGINEER,
        departmentName: 'Ingeniería de campo',
        employeeNumber: 'NX-050',
    },
    {
        nombre: 'Paola Reyes',
        email: 'contabilidad@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.ACCOUNTANT,
        departmentName: 'Administración',
        employeeNumber: 'NX-051',
    },
    {
        nombre: 'Daniela Vargas',
        email: 'rh@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.HR_SPECIALIST,
        departmentName: 'Administración',
        employeeNumber: 'NX-052',
    },
    {
        nombre: 'Andrea Cisneros',
        email: 'marketing@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.DESIGNER,
        departmentName: 'Marketing',
        employeeNumber: 'NX-053',
    },
    {
        nombre: 'Héctor Ramírez',
        email: 'compras@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.PROCUREMENT_OFFICER,
        departmentName: 'Compras',
        employeeNumber: 'NX-054',
    },
    {
        nombre: 'Mónica Esparza',
        email: 'helpdesk@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.SUPPORT_AGENT,
        departmentName: 'Soporte',
        employeeNumber: 'NX-055',
    },
    // ── Operativos ────────────────────────────────────────────────────────
    {
        nombre: 'Karina Martínez',
        email: 'vendedor@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.SALES_REP,
        departmentName: 'Ventas',
        employeeNumber: 'NX-060',
    },
    {
        nombre: 'Julio Rivazquez',
        email: 'julio.rivazquez@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.FIELD_ENGINEER,
        departmentName: 'Ingeniería de campo',
        employeeNumber: 'NX-061',
    },
    {
        nombre: 'David Morzenon',
        email: 'david.morzenon@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.FIELD_ENGINEER,
        departmentName: 'Ingeniería de campo',
        employeeNumber: 'NX-062',
    },
    {
        nombre: 'Israel Ralima',
        email: 'israel.ralima@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.FIELD_ENGINEER,
        departmentName: 'Ingeniería de campo',
        employeeNumber: 'NX-063',
    },
    {
        nombre: 'Brenda Soto',
        email: 'recepcion@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.ADMIN_STAFF,
        departmentName: 'Administración',
        employeeNumber: 'NX-064',
    },
    {
        nombre: 'Eduardo Quintero',
        email: 'noc.operador@nexara.com.mx',
        orgRoleKey: org_roles_1.ORG_ROLE_KEYS.NOC_OPERATOR,
        departmentName: 'NOC',
        employeeNumber: 'NX-065',
    },
];
function seedRoleTemplates() {
    return __awaiter(this, void 0, void 0, function () {
        var count, _i, ORG_ROLE_TEMPLATES_1, template, orgRoleKey, nombre, nivelAutoridad, flags;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🌱 [demo-users] Upsert de plantillas de rol ERP…');
                    count = 0;
                    _i = 0, ORG_ROLE_TEMPLATES_1 = org_roles_1.ORG_ROLE_TEMPLATES;
                    _a.label = 1;
                case 1:
                    if (!(_i < ORG_ROLE_TEMPLATES_1.length)) return [3 /*break*/, 4];
                    template = ORG_ROLE_TEMPLATES_1[_i];
                    orgRoleKey = template.orgRoleKey, nombre = template.nombre, nivelAutoridad = template.nivelAutoridad, flags = template.flags;
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: nombre },
                            update: __assign({ orgRoleKey: orgRoleKey, nivelAutoridad: nivelAutoridad }, flags),
                            create: __assign({ nombre: nombre, orgRoleKey: orgRoleKey, nivelAutoridad: nivelAutoridad }, flags),
                        })];
                case 2:
                    _a.sent();
                    count += 1;
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    console.log("   \u2705 ".concat(count, " roles ERP sincronizados."));
                    return [2 /*return*/];
            }
        });
    });
}
function ensureDepartment(name) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, created;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, prisma.department.findUnique({ where: { nombre: name } })];
                case 1:
                    existing = _a.sent();
                    if (existing)
                        return [2 /*return*/, existing.id];
                    return [4 /*yield*/, prisma.department.create({ data: { nombre: name } })];
                case 2:
                    created = _a.sent();
                    return [2 /*return*/, created.id];
            }
        });
    });
}
function seedDemoUsers() {
    return __awaiter(this, void 0, void 0, function () {
        var created, updated, _loop_1, _i, DEMO_USERS_1, u;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('🌱 [demo-users] Upsert de usuarios demo…');
                    created = 0;
                    updated = 0;
                    _loop_1 = function (u) {
                        var template, role, departmentId, existing;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    template = org_roles_1.ORG_ROLE_TEMPLATES.find(function (t) { return t.orgRoleKey === u.orgRoleKey; });
                                    if (!template) {
                                        console.warn("   \u26A0\uFE0F  Sin plantilla para ".concat(u.orgRoleKey, " \u2014 se omite ").concat(u.email));
                                        return [2 /*return*/, "continue"];
                                    }
                                    return [4 /*yield*/, prisma.role.findUnique({ where: { nombre: template.nombre } })];
                                case 1:
                                    role = _c.sent();
                                    if (!role) {
                                        console.warn("   \u26A0\uFE0F  Rol ".concat(template.nombre, " no existe en DB \u2014 se omite ").concat(u.email));
                                        return [2 /*return*/, "continue"];
                                    }
                                    return [4 /*yield*/, ensureDepartment(u.departmentName)];
                                case 2:
                                    departmentId = _c.sent();
                                    return [4 /*yield*/, prisma.user.findUnique({ where: { email: u.email } })];
                                case 3:
                                    existing = _c.sent();
                                    if (!existing) return [3 /*break*/, 5];
                                    return [4 /*yield*/, prisma.user.update({
                                            where: { email: u.email },
                                            data: {
                                                nombre: u.nombre,
                                                roleId: role.id,
                                                departmentId: departmentId,
                                                employeeNumber: (_a = u.employeeNumber) !== null && _a !== void 0 ? _a : existing.employeeNumber,
                                            },
                                        })];
                                case 4:
                                    _c.sent();
                                    updated += 1;
                                    return [3 /*break*/, 7];
                                case 5: return [4 /*yield*/, prisma.user.create({
                                        data: {
                                            nombre: u.nombre,
                                            email: u.email,
                                            passwordHash: DEMO_PASSWORD_HASH,
                                            roleId: role.id,
                                            departmentId: departmentId,
                                            employeeNumber: u.employeeNumber,
                                        },
                                    })];
                                case 6:
                                    _c.sent();
                                    created += 1;
                                    _c.label = 7;
                                case 7: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, DEMO_USERS_1 = DEMO_USERS;
                    _b.label = 1;
                case 1:
                    if (!(_i < DEMO_USERS_1.length)) return [3 /*break*/, 4];
                    u = DEMO_USERS_1[_i];
                    return [5 /*yield**/, _loop_1(u)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    console.log("   \u2705 ".concat(created, " usuarios creados \u00B7 ").concat(updated, " actualizados"));
                    console.log("   \uD83D\uDD11 Password demo: ".concat(DEMO_PASSWORD));
                    return [2 /*return*/];
            }
        });
    });
}
function printSummary() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, ORG_ROLE_TEMPLATES_2, template, role, users, lead, extra;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\n📋 Resumen final por rol:');
                    _i = 0, ORG_ROLE_TEMPLATES_2 = org_roles_1.ORG_ROLE_TEMPLATES;
                    _a.label = 1;
                case 1:
                    if (!(_i < ORG_ROLE_TEMPLATES_2.length)) return [3 /*break*/, 5];
                    template = ORG_ROLE_TEMPLATES_2[_i];
                    return [4 /*yield*/, prisma.role.findUnique({ where: { nombre: template.nombre } })];
                case 2:
                    role = _a.sent();
                    if (!role)
                        return [3 /*break*/, 4];
                    return [4 /*yield*/, prisma.user.findMany({
                            where: { roleId: role.id },
                            select: { nombre: true, email: true },
                            orderBy: { id: 'asc' },
                        })];
                case 3:
                    users = _a.sent();
                    if (users.length === 0)
                        return [3 /*break*/, 4];
                    lead = users[0];
                    extra = users.length > 1 ? " (+".concat(users.length - 1, ")") : '';
                    console.log("   \u00B7 ".concat(template.label.padEnd(32), " \u2192 ").concat(lead.nombre).concat(extra, " <").concat(lead.email, ">"));
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 1];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, seedRoleTemplates()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, seedDemoUsers()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, printSummary()];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .then(function () {
    console.log('\n✨ seed-demo-users completado.');
})
    .catch(function (e) {
    console.error('❌ seed-demo-users falló:', e);
    process.exit(1);
})
    .finally(function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, prisma.$disconnect()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
