import type { Product } from '../../core/entities/Product.js';
import type { ProductRepository } from '../../core/ports/repositories.js';

/** Read model for the catalogue keyboard. */
export interface ProductListItem {
  id: string;
  name: string;
  stock: number;
  priceLabel: string;
  inStock: boolean;
}

export class ListProductsUseCase {
  constructor(private readonly deps: { products: ProductRepository }) {}

  async execute(): Promise<ProductListItem[]> {
    const products = await this.deps.products.listActive();

    return products.map((product: Product) => ({
      id: product.id,
      name: product.name,
      stock: product.stock,
      priceLabel: product.sellingPrice.format(),
      inStock: product.stock > 0,
    }));
  }
}
