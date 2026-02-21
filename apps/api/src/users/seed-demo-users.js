"use strict";
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
var prisma = new client_1.PrismaClient();
var upsertUser = function (data) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, prisma.user.upsert({
                where: { email: data.email },
                update: {
                    nombre: data.nombre,
                    passwordHash: data.passwordHash,
                    roleId: data.roleId,
                    departmentId: data.departmentId,
                },
                create: data,
            })];
    });
}); };
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var ceoRole, cooRole, staffRole, panelWebRole, panelTiendaRole, panelInternoRole, deptGeneral, passCEO1, passCEO2, passCOO, passStaff1, passStaff2, passPanelWeb, passPanelTienda, passPanelInterno, _a, _b, _c, _d, _e, _f, _g, _h;
        var _j, _k, _l, _m, _o, _p, _q, _r;
        return __generator(this, function (_s) {
            switch (_s.label) {
                case 0: return [4 /*yield*/, prisma.role.upsert({
                        where: { nombre: 'CEO' },
                        update: {
                            nivelAutoridad: 0,
                            accesoConsole: true,
                            accesoConsoleAdmin: true,
                            accesoActividades: true,
                            accesoEvidencias: true,
                            accesoViaticos: true,
                            accesoVehiculos: true,
                            accesoAsistencia: true,
                            accesoGps: true,
                            accesoGestionUsuarios: true,
                            accesoGestionTienda: true,
                            accesoGestionWeb: true,
                            accesoContabilidad: true,
                        },
                        create: {
                            nombre: 'CEO',
                            nivelAutoridad: 0,
                            accesoConsole: true,
                            accesoConsoleAdmin: true,
                            accesoActividades: true,
                            accesoEvidencias: true,
                            accesoViaticos: true,
                            accesoVehiculos: true,
                            accesoAsistencia: true,
                            accesoGps: true,
                            accesoGestionUsuarios: true,
                            accesoGestionTienda: true,
                            accesoGestionWeb: true,
                            accesoContabilidad: true,
                        },
                    })];
                case 1:
                    ceoRole = _s.sent();
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: 'COO' },
                            update: {
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoConsoleAdmin: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                                accesoGestionUsuarios: true,
                                accesoContabilidad: true,
                            },
                            create: {
                                nombre: 'COO',
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoConsoleAdmin: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                                accesoGestionUsuarios: true,
                                accesoContabilidad: true,
                            },
                        })];
                case 2:
                    cooRole = _s.sent();
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: 'Staff' },
                            update: {
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                            },
                            create: {
                                nombre: 'Staff',
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                            },
                        })];
                case 3:
                    staffRole = _s.sent();
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: 'PanelWeb' },
                            update: { nivelAutoridad: 0, accesoGestionWeb: true },
                            create: { nombre: 'PanelWeb', nivelAutoridad: 0, accesoGestionWeb: true },
                        })];
                case 4:
                    panelWebRole = _s.sent();
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: 'PanelTienda' },
                            update: { nivelAutoridad: 0, accesoGestionTienda: true },
                            create: { nombre: 'PanelTienda', nivelAutoridad: 0, accesoGestionTienda: true },
                        })];
                case 5:
                    panelTiendaRole = _s.sent();
                    return [4 /*yield*/, prisma.role.upsert({
                            where: { nombre: 'PanelInterno' },
                            update: {
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoConsoleAdmin: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                            },
                            create: {
                                nombre: 'PanelInterno',
                                nivelAutoridad: 0,
                                accesoConsole: true,
                                accesoConsoleAdmin: true,
                                accesoActividades: true,
                                accesoEvidencias: true,
                                accesoViaticos: true,
                                accesoVehiculos: true,
                                accesoAsistencia: true,
                                accesoGps: true,
                            },
                        })];
                case 6:
                    panelInternoRole = _s.sent();
                    return [4 /*yield*/, prisma.department.upsert({
                            where: { nombre: 'General' },
                            update: {},
                            create: { nombre: 'General' },
                        })];
                case 7:
                    deptGeneral = _s.sent();
                    passCEO1 = 'NexaraCeo2026@!2888';
                    passCEO2 = 'NexaraDev2026@!30';
                    passCOO = 'NexaraCoo2026!@';
                    passStaff1 = 'NexaraSoporte2026!';
                    passStaff2 = 'NexaraSistemas2026!';
                    passPanelWeb = 'DemoPanelWeb2026!';
                    passPanelTienda = 'DemoPanelTienda2026!';
                    passPanelInterno = 'DemoPanelInterno2026!';
                    _a = upsertUser;
                    _j = {
                        nombre: 'Usuario Demo Panel Web',
                        email: 'demo.panelweb@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passPanelWeb, 10)];
                case 8: 
                // Usuarios demo para nuevos roles
                return [4 /*yield*/, _a.apply(void 0, [(_j.passwordHash = _s.sent(),
                            _j.roleId = panelWebRole.id,
                            _j.departmentId = deptGeneral.id,
                            _j)])];
                case 9:
                    // Usuarios demo para nuevos roles
                    _s.sent();
                    _b = upsertUser;
                    _k = {
                        nombre: 'Usuario Demo Panel Tienda',
                        email: 'demo.paneltienda@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passPanelTienda, 10)];
                case 10: return [4 /*yield*/, _b.apply(void 0, [(_k.passwordHash = _s.sent(),
                            _k.roleId = panelTiendaRole.id,
                            _k.departmentId = deptGeneral.id,
                            _k)])];
                case 11:
                    _s.sent();
                    _c = upsertUser;
                    _l = {
                        nombre: 'Usuario Demo Panel Interno',
                        email: 'demo.panelinterno@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passPanelInterno, 10)];
                case 12: return [4 /*yield*/, _c.apply(void 0, [(_l.passwordHash = _s.sent(),
                            _l.roleId = panelInternoRole.id,
                            _l.departmentId = deptGeneral.id,
                            _l)])];
                case 13:
                    _s.sent();
                    _d = upsertUser;
                    _m = {
                        nombre: 'Christian Del Pozo (CEO)',
                        email: 'gerencia@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passCEO1, 10)];
                case 14: return [4 /*yield*/, _d.apply(void 0, [(_m.passwordHash = _s.sent(),
                            _m.roleId = ceoRole.id,
                            _m.departmentId = deptGeneral.id,
                            _m)])];
                case 15:
                    _s.sent();
                    _e = upsertUser;
                    _o = {
                        nombre: 'Karen Elizalde Sarmiento (COO)',
                        email: 'ventas@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passCOO, 10)];
                case 16: return [4 /*yield*/, _e.apply(void 0, [(_o.passwordHash = _s.sent(),
                            _o.roleId = cooRole.id,
                            _o.departmentId = deptGeneral.id,
                            _o)])];
                case 17:
                    _s.sent();
                    _f = upsertUser;
                    _p = {
                        nombre: 'Carolina Juarez Alvarez (Ingeniera de Soporte)',
                        email: 'soporte@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passStaff1, 10)];
                case 18: return [4 /*yield*/, _f.apply(void 0, [(_p.passwordHash = _s.sent(),
                            _p.roleId = staffRole.id,
                            _p.departmentId = deptGeneral.id,
                            _p)])];
                case 19:
                    _s.sent();
                    _g = upsertUser;
                    _q = {
                        nombre: 'Alejandro Gonzales (Ingeniero de Sistemas)',
                        email: 'sistemas@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passStaff2, 10)];
                case 20: return [4 /*yield*/, _g.apply(void 0, [(_q.passwordHash = _s.sent(),
                            _q.roleId = staffRole.id,
                            _q.departmentId = deptGeneral.id,
                            _q)])];
                case 21:
                    _s.sent();
                    _h = upsertUser;
                    _r = {
                        nombre: 'Adam Del Pozo (Desarrollador)',
                        email: 'developer@nexara.com.mx'
                    };
                    return [4 /*yield*/, bcrypt.hash(passCEO2, 10)];
                case 22: return [4 /*yield*/, _h.apply(void 0, [(_r.passwordHash = _s.sent(),
                            _r.roleId = ceoRole.id,
                            _r.departmentId = deptGeneral.id,
                            _r)])];
                case 23:
                    _s.sent();
                    console.log('Contraseñas asignadas:');
                    console.log('Christian Del Pozo (CEO):', passCEO1);
                    console.log('Adam Del Pozo (Desarrollador):', passCEO2);
                    console.log('Karen Elizalde Sarmiento (COO):', passCOO);
                    console.log('Carolina Juarez Alvarez (Ingeniera de Soporte):', passStaff1);
                    console.log('Alejandro Gonzales (Ingeniero de Sistemas):', passStaff2);
                    console.log('Usuario Demo Panel Web:', passPanelWeb);
                    console.log('Usuario Demo Panel Tienda:', passPanelTienda);
                    console.log('Usuario Demo Panel Interno:', passPanelInterno);
                    console.log('Usuarios demo actualizados.');
                    return [2 /*return*/];
            }
        });
    });
}
main()
    .catch(function (e) {
    console.error(e);
    process.exit(1);
})
    .finally(function () { return prisma.$disconnect(); });
