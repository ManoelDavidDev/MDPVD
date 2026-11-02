import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { JAVAFX_REFERENCE_FILES } from './server/application/javafxBlueprint.ts';
import {
  DomainError,
  authenticateUser,
  bootstrapSession,
  cancelSale,
  changeUserPassword,
  closeCashRegister,
  completeSale,
  createCashMovement,
  createCategory,
  createDatabaseBackup,
  createUser,
  getAnalyticalReports,
  getOpenCashRegister,
  getSaleById,
  getSessionUser,
  getSystemSettings,
  listAuditLogs,
  listBackups,
  listCashMovements,
  listCashRegisters,
  listCategories,
  listProducts,
  listPromotions,
  listRoles,
  listSales,
  listStockMovements,
  listUsers,
  logoutSession,
  openCashRegister,
  previewCart,
  recordManualStockMovement,
  restoreDatabaseBackup,
  retransmitFiscalDocument,
  reverseCashMovement,
  saveProduct,
  savePromotion,
  updateRolePermissions,
  updateSystemSettings,
  updateUserStatus,
} from './server/application/services.ts';
import type { UserEntity } from './server/domain/models.ts';
import { getBackupDirectory, getDb } from './server/infrastructure/database.ts';

interface AuthedRequest extends Request {
  user?: UserEntity;
  token?: string;
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (typeof req.query.token === 'string') {
    return req.query.token;
  }
  return undefined;
}

function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const user = getSessionUser(token);
  if (!user) {
    next(new DomainError('Sessão expirada ou não autenticada.', 401, 'UNAUTHENTICATED'));
    return;
  }
  req.user = user;
  req.token = token;
  next();
}

async function startServer() {
  // Ensure SQLite DB and migrations initialize on boot
  getDb();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // ==========================================================================
  // AUTH & WORKSPACE STATE
  // ==========================================================================
  app.post('/api/auth/login', (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      const result = authenticateUser(String(username ?? ''), String(password ?? ''));
      res.json({
        ...result,
        openRegister: getOpenCashRegister(),
        settings: getSystemSettings(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/bootstrap', (_req, res, next) => {
    try {
      const result = bootstrapSession();
      res.json({
        ...result,
        openRegister: getOpenCashRegister(),
        settings: getSystemSettings(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({
      user: req.user,
      openRegister: getOpenCashRegister(),
      settings: getSystemSettings(),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    logoutSession(extractToken(req));
    res.json({ ok: true });
  });

  // ==========================================================================
  // USERS & RBAC PERMISSIONS (RF01)
  // ==========================================================================
  app.get('/api/users', requireAuth, (_req, res, next) => {
    try {
      res.json({ users: listUsers(), roles: listRoles() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/users', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const user = createUser(req.user!, req.body);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/users/:id/status', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const user = updateUserStatus(req.user!, Number(req.params.id), req.body);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/users/:id/password', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      changeUserPassword(
        req.user!,
        Number(req.params.id),
        String(req.body?.newPassword ?? ''),
        req.body?.currentPassword
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.put('/api/roles/:id/permissions', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const roles = updateRolePermissions(
        req.user!,
        Number(req.params.id),
        Array.isArray(req.body?.permissions) ? req.body.permissions : []
      );
      res.json({ roles });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // PRODUCTS, CATEGORIES & PROMOTIONS (RF02 & RF03)
  // ==========================================================================
  app.get('/api/catalog', requireAuth, (req, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
      const onlyActive = req.query.onlyActive === 'true';
      res.json({
        products: listProducts({ search, categoryId, onlyActive }),
        categories: listCategories(),
        promotions: listPromotions(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/categories', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const category = createCategory(req.user!, req.body);
      res.status(201).json({ category });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/products', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const product = saveProduct(req.user!, req.body);
      res.json({ product });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/promotions', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const promotion = savePromotion(req.user!, req.body);
      res.json({ promotion });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/pos/evaluate-cart', requireAuth, (req, res, next) => {
    try {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const manualDiscount = Number(req.body?.manualDiscount ?? 0);
      res.json(previewCart(items, manualDiscount));
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // CASH REGISTER & SANGRIA / SUPRIMENTO (RF05 & RF06)
  // ==========================================================================
  app.get('/api/cash-registers', requireAuth, (_req, res, next) => {
    try {
      const openRegister = getOpenCashRegister();
      res.json({
        openRegister,
        registers: listCashRegisters(),
        movements: listCashMovements(openRegister?.id),
        allMovements: listCashMovements(),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cash-registers/open', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const register = openCashRegister(
        req.user!,
        Number(req.body?.openingBalance ?? 0),
        req.body?.notes
      );
      res.status(201).json({ register });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cash-registers/close', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const register = closeCashRegister(
        req.user!,
        Number(req.body?.countedCashBalance),
        req.body?.closingNotes
      );
      res.json({ register });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/cash-movements', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const result = createCashMovement(req.user!, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/cash-movements/:id/reverse',
    requireAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const result = reverseCashMovement(
          req.user!,
          Number(req.params.id),
          String(req.body?.reason ?? ''),
          req.body?.authorizer
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // SALES & FISCAL DOCUMENTS (RF04 & RF08)
  // ==========================================================================
  app.get('/api/sales', requireAuth, (req, res, next) => {
    try {
      const sales = listSales({
        cashRegisterId: req.query.cashRegisterId
          ? Number(req.query.cashRegisterId)
          : undefined,
        startDate:
          typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
      });
      res.json({ sales });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sales/:id', requireAuth, (req, res, next) => {
    try {
      const sale = getSaleById(Number(req.params.id));
      if (!sale) throw new DomainError('Venda não encontrada.', 404);
      res.json({ sale });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sales', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const sale = completeSale(req.user!, req.body);
      res.status(201).json({ sale, openRegister: getOpenCashRegister() });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/sales/:id/cancel', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const sale = cancelSale(
        req.user!,
        Number(req.params.id),
        String(req.body?.reason ?? ''),
        req.body?.authorizer
      );
      res.json({ sale, openRegister: getOpenCashRegister() });
    } catch (err) {
      next(err);
    }
  });

  app.post(
    '/api/sales/:id/retransmit-fiscal',
    requireAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const sale = retransmitFiscalDocument(req.user!, Number(req.params.id));
        res.json({ sale });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // STOCK MOVEMENTS (RF07)
  // ==========================================================================
  app.get('/api/stock', requireAuth, (req, res, next) => {
    try {
      const productId = req.query.productId ? Number(req.query.productId) : undefined;
      const products = listProducts();
      const lowStockProducts = products.filter(
        (p) => p.active && p.stockQuantity <= p.minStock
      );
      res.json({
        products,
        lowStockProducts,
        movements: listStockMovements(productId),
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/stock/movements', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const result = recordManualStockMovement(req.user!, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // REPORTS & CHARTS (RF09)
  // ==========================================================================
  app.get('/api/reports', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const data = getAnalyticalReports(req.user!, {
        startDate:
          typeof req.query.startDate === 'string' && req.query.startDate
            ? req.query.startDate
            : undefined,
        endDate:
          typeof req.query.endDate === 'string' && req.query.endDate
            ? req.query.endDate
            : undefined,
        categoryId: req.query.categoryId ? Number(req.query.categoryId) : undefined,
        operatorId: req.query.operatorId ? Number(req.query.operatorId) : undefined,
        paymentMethod:
          typeof req.query.paymentMethod === 'string' && req.query.paymentMethod
            ? (req.query.paymentMethod as never)
            : undefined,
      });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // SETTINGS, AUDIT LOG, BACKUPS & JAVAFX BLUEPRINT (RF08, RF10)
  // ==========================================================================
  app.get('/api/settings', requireAuth, (_req, res) => {
    res.json({
      settings: getSystemSettings(),
      javafxBlueprint: JAVAFX_REFERENCE_FILES,
    });
  });

  app.put('/api/settings', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const settings = updateSystemSettings(req.user!, req.body);
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/audit-logs', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json({ logs: listAuditLogs(req.user!, 200) });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/backups', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json({ backups: listBackups(req.user!) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/backups', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      const backup = createDatabaseBackup(req.user!, req.body?.label);
      res.status(201).json({ backup, backups: listBackups(req.user!) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/backups/restore', requireAuth, (req: AuthedRequest, res, next) => {
    try {
      restoreDatabaseBackup(req.user!, String(req.body?.filename ?? ''));
      res.json({
        ok: true,
        openRegister: getOpenCashRegister(),
        backups: listBackups(req.user!),
      });
    } catch (err) {
      next(err);
    }
  });

  app.get(
    '/api/backups/:filename/download',
    requireAuth,
    (req: AuthedRequest, res, next) => {
      try {
        const cleanName = path.basename(String(req.params.filename));
        const fullPath = path.join(getBackupDirectory(), cleanName);
        if (!fs.existsSync(fullPath)) {
          throw new DomainError('Arquivo de backup não encontrado.', 404);
        }
        res.download(fullPath, cleanName);
      } catch (err) {
        next(err);
      }
    }
  );

  // Error Handler
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (err instanceof DomainError) {
        res.status(err.statusCode).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      console.error('[MDPDV Server Error]:', err);
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Erro interno inesperado ao processar a operação.',
        code: 'INTERNAL_ERROR',
      });
    }
  );

  // Vite Middleware in Development / Static Build in Production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MDPDV Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
