import { Component } from '@angular/core';
import { UserService } from './services/user.service';

@Component({
  selector: 'app-root',
  template: '<h1>{{title}}</h1>',
})
export class AppComponent {
  title = 'my-app';
  constructor(private userService: UserService) {}
}
