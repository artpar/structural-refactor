import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UserService {
  getUsers() {
    return ['Alice', 'Bob'];
  }
}
