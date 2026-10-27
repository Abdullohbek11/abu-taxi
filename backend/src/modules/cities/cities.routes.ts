import { Router } from 'express';
import { citiesController } from './cities.controller.js';

export const citiesRouter = Router();

citiesRouter.get('/', citiesController.list);
