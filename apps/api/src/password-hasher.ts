import { hash, verify, type Options } from '@node-rs/argon2';

const ARGON2ID_OPTIONS: Options = {
  // @node-rs/argon2 publishes Algorithm as an ambient const enum, which cannot
  // be imported with this repository's verbatimModuleSyntax setting. The
  // library's declared Argon2id discriminator is the stable value 2.
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const PASSWORD_ALGORITHM = 'ARGON2ID_V1' as const;

export interface PasswordHasher {
  hashPassword(password: string): Promise<string>;
  verifyPassword(encodedHash: string, password: string): Promise<boolean>;
  verifyUnknownUser(password: string): Promise<void>;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly dummyHash = hash('constant dummy credential path', ARGON2ID_OPTIONS);

  hashPassword(password: string): Promise<string> {
    return hash(password, ARGON2ID_OPTIONS);
  }

  async verifyPassword(encodedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(encodedHash, password);
    } catch {
      return false;
    }
  }

  async verifyUnknownUser(password: string): Promise<void> {
    await this.verifyPassword(await this.dummyHash, password);
  }
}
