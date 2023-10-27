import {Injectable, OnDestroy} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {BehaviorSubject, from, interval, Observable, of} from "rxjs";
import {User} from "../models/user.model";
import {map, switchMap, take, takeWhile, tap} from "rxjs/operators";
import {Plugins} from "@capacitor/core";
import {AlertController, LoadingController} from "@ionic/angular";
import {UserData} from "../interfaces/UserData";
import {Router} from "@angular/router";

export interface AuthResponseData {
  kind: string;
  idToken: string;
  email: string;
  refreshToken: string;
  localId: string;
  expiresIn: string;
  registered?: boolean;
}


@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {

  private _user = new BehaviorSubject<User>(null);
  private activeLogoutTimer: any;
  isLoading = false;

  get userIsAuthenticated() {
    return this._user.asObservable().pipe(map(user => {
      //TODO: itt false volt eredetileg
      return (user) ? !!user.token : null;
    }));
  }

  get user() {
    return this._user.asObservable().pipe(map(user => {
      console.log("user", user);
      return (user) ? user : null;
    }));
  }

  get userId() {
    return this._user.asObservable().pipe(map(user => {
      return (user) ? user.id : null;
    }));
  }

  get token() {
    return this._user.asObservable().pipe(map(user => {
      return (user) ? user.token : null;
    }));
  }

  constructor(private http: HttpClient,
              private loadingCtrl: LoadingController,
              private alertCtrl: AlertController,
              private router: Router) {
  }

  signup(email: string, password: string) {
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${
        environment.firebaseAPIKey
      }`,
      {email, password, returnSecureToken: true}
    )
  }

  login(email: string, password: string) {
    console.log("login", email, password);
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${
        environment.firebaseAPIKey
      }`,
      {email, password, returnSecureToken: true}
    )
  }

  loginAsAGuest() {
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${
        environment.firebaseAPIKey
      }`,
      {returnSecureToken: true}
    );
  }

  sendPasswordResetEamil(email: string) {
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${
        environment.firebaseAPIKey
      }`,
      {requestType: 'PASSWORD_RESET', email}
    );
  }

  changeEmail(token: string, newEmail: string) {
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${
        environment.firebaseAPIKey
      }`,
      {idToken: token, email: newEmail, returnSecureToken: true}
    );
  }

  sendEmailVerification(token: string) {
    return this.http.post<AuthResponseData>(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${
        environment.firebaseAPIKey
      }`,
      {requestType: 'VERIFY_EMAIL', idToken: token}
    );
  }

  getUserData(token: string) {
    return this.http.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${
        environment.firebaseAPIKey
      }`,
      {idToken: token}
    );
  }

  deleteAccount() {
    let currentUser: User;
    return this.user.pipe(
      take(1),
      switchMap(user => {
        currentUser = user;
        return this.token;
      }),
      take(1),
      switchMap(token => {
        if (!currentUser) {
          throw new Error('No user found!');
        }
        return this.http.post<AuthResponseData>(
          `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${
            environment.firebaseAPIKey
          }`,
          {idToken: token}
        );
      }),
    );
  }

  logout() {
    if (this.activeLogoutTimer) {
      clearTimeout(this.activeLogoutTimer);
    }
    this._user.next(null);

    console.log("logout");
    this.router.navigate(['/', 'auth'])
    // Plugins.Storage.remove({key: 'authData'});
  }

  private autoLogout(duration: number) {
    if (this.activeLogoutTimer) {
      clearTimeout(this.activeLogoutTimer);
    }
    this.activeLogoutTimer = setTimeout(() => {
      this.logout();
    }, duration)
  }

  autoLogin() {
    return from(Plugins.Storage.get({key: 'authData'})).pipe(
      map(storedData => {
        if (!storedData || !(storedData as { key: string; value: string }).value) {
          return null;
        }
        const parsedData = JSON.parse((storedData as { key: string; value: string }).value) as {
          id: string;
          email: string;
          username: string;
          country: string;
          picture: string;
          token: string;
          tokenExpirationDate: string;
        };
        const expirationTime = new Date(parsedData.tokenExpirationDate);
        if (expirationTime <= new Date()) {
          return null;
        }
        return new User(parsedData.id, parsedData.email, parsedData.username, parsedData.country,
          parsedData.picture, [], parsedData.token, expirationTime);
      }),
      tap(user => {
        if (user) {
          this._user.next(user);
          this.autoLogout(user.tokenDuration);
        }
      }),
      map(user => {
        return !!user;
      })
    );
  }

  setUserWhenLoggedIn(user: User, token: string, expirationTime: Date) {
    console.log("setUserData");
    this._user.next(user);
    this.autoLogout(user.tokenDuration);
    this.storeAuthData(user.id, token, expirationTime.toISOString(), user.email);
  }

  setUser(user: UserData) {
    this.user.pipe(
      take(1)).subscribe((currentUser) => {
        currentUser.email = user.email;
        currentUser.username = user.username;
        currentUser.country = user.country;
        currentUser.picture = user.picture;
        currentUser.favouriteGames = user.favouriteGames;
      console.log("setUserData", currentUser);
      this._user.next(currentUser);
    });
  }

  verifyEmail(token: string): Observable<{success: boolean, message: string}> {
    return new Observable<{success: boolean, message: string}>((observer ) => {
      this.isLoading = true;
      this.loadingCtrl.create({ keyboardClose: true, message: 'Sending an email to you...' }).then(loadingEl => {
        loadingEl.present();
        let doItAgain = true;

        this.sendEmailVerification(token).pipe(
          switchMap(() => {
            loadingEl.message = "Please verify your email";

            return interval(5000).pipe(
              switchMap((l) => {
                return this.getUserData(token);
              }),
              takeWhile((resData: { kind: any, users: any }) => (!resData.users[0]?.emailVerified || doItAgain))
            );
          })
        ).subscribe(
          (resData: { kind: any, users: any }) => {
            if (resData.users && resData.users[0].emailVerified) {
              doItAgain = false;
              this.isLoading = false;
              loadingEl.dismiss();
              this.showAlert("Email verification was successful!", "Email verified");
              observer.next({success: true, message: ""});
              observer.complete();
            }
          },
          errRes => {
            const code = errRes.error.error.message;
            let message = 'Something went wrong, please try again.';

            switch (code) {
              case "INVALID_ID_TOKEN": {
                message = "The user's credential is no longer valid. The user must sign in again.";
                break;
              }
              case "USER_NOT_FOUND": {
                message = "There is no user record corresponding to this identifier. The user may have been deleted.";
                break;
              }
              case "EMAIL_EXISTS": {
                message = "The email address is already in use by another account.";
                break;
              }            }
            this.showAlert(message, "Email is not verified");
            observer.next({success: false, message: message});
            observer.complete();
          }
        );
      });
    });
  }

  updateEmailProcess(newEmail: string) {
    let currentUser: User;
    let currentToken = "";
    return this.token.pipe(
      take(1),
      switchMap(token => {
        currentToken = token;
        console.log("token", token);
        return this.user;
      }),
      take(1),
      switchMap(user => {
        currentUser = user;
        console.log("user", user);

        return this.changeEmail(currentToken, newEmail);
      }),
      take(1),
      switchMap(response => {
        console.log("response1", response);
        return this.verifyEmail(currentToken);
      }),
      tap(response => {
        if (!response.success) {
          console.log("response2", response);
          throw new Error(response.message);
        }
        currentUser.email = newEmail;
        this._user.next(currentUser);
      })
    );
  }

  private storeAuthData(userId: string, token: string, tokenExpirationDate: string, email: string) {
    const data = JSON.stringify({
      userId: userId,
      token: token,
      tokenExpirationDate: tokenExpirationDate,
      email: email
    });
    //TODO: Plugins itt mit jelent, működni fog?
    // Plugins.Storage.set({key: 'authData', value: data})
  }

  private showAlert(message: string, header: string) {
    this.alertCtrl
      .create({
        header: header,
        message: message,
        buttons: ['Okay']
      })
      .then(alertEl => alertEl.present());
  }

  ngOnDestroy(): void {
    if (this.activeLogoutTimer) {
      clearTimeout(this.activeLogoutTimer);
    }
  }
}