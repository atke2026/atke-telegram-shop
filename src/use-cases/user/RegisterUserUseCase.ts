import type { User } from '../../core/entities/User.js';
import type { UserRepository } from '../../core/ports/repositories.js';

/** Idempotent — every /start runs through here. */
export class RegisterUserUseCase {
  constructor(private readonly deps: { users: UserRepository }) {}

  async execute(input: {
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
  }): Promise<User> {
    return this.deps.users.create(input);
  }
}
