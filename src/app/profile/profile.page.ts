import {Component, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {AuthService} from "../auth/auth.service";
import {GamesService} from "../games/games.service";
import {UserService} from "../services/user.service";
import {AlertController, IonModal, LoadingController, ModalController, NavController} from "@ionic/angular";
import {catchError, switchMap, take} from "rxjs/operators";
import {BehaviorSubject, forkJoin, of, Subscription} from "rxjs";
import {Game} from "../models/game.model";
import {User} from "../models/user.model";
import {ActivatedRoute, Router} from "@angular/router";
import {UserData} from "../interfaces/UserData";
import {CountryService} from "../services/country.service";
import {ImageService} from "../services/image.service";
import {ImagePickerModalComponent} from "../shared/components/image-picker-modal/image-picker-modal.component";
import {PickAThingComponent} from "../shared/components/pick-a-thing/pick-a-thing.component";
import {EventsService} from "../events/events.service";
import {Event} from "../models/event.model";
import {SettingsComponent} from "./settings/settings.component";
import {ConnectionsService} from "../connections/connections.service";
import {Request} from "../models/request.model";

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit, OnDestroy {

  userIsLoading = false;
  gamesAreLoading = false;
  eventsAreLoading = false;
  loadedOwnGames: Game[];
  loadedOwnEvents: Event[]; //amiket csináltum, plusz amikre jelentkeztem
  loadedUser: UserData;
  loadedUserId: string;
  loggedUser: User;
  ownProfile = false;
  listGames = true;
  countries = [];
  userSub: Subscription;
  firstTime = false;

  constructor(private gamesService: GamesService,
              private eventsService: EventsService,
              private userService: UserService,
              private authService: AuthService,
              private connectionService: ConnectionsService,
              private alertCtrl: AlertController,
              private activatedRoute: ActivatedRoute,
              private router: Router,
              private navCtrl: NavController,
              private countryService: CountryService,
              private imageService: ImageService,
              private loadingCtrl: LoadingController,
              private modalCtrl: ModalController) {
  }


  ngOnInit() {
    this.activatedRoute.paramMap.subscribe(paramMap => {
      this.userIsLoading = true;
      this.gamesAreLoading = true;

      if (!paramMap.has('userId')) {
        this.userSub = this.authService.user.subscribe(currentUser => {
          if (currentUser) {
            this.ownProfile = true;
            this.loadedUserId = currentUser.id;
            this.loadedUser = {
              id: currentUser.id,
              email: currentUser.email,
              username: currentUser.username,
              country: currentUser.country,
              picture: currentUser.picture,
              favouriteGames: currentUser.favouriteGames,
              eventsUserSignedUpFor: currentUser.eventsUserSignedUpFor,
              savedEvents: currentUser.savedEvents,
              permissions: currentUser.permissions
            };
            this.userIsLoading = false;
            this.fetchLoadedUserData();
          } else {
            this.showALert();
          }
        });
      } else {
        this.ownProfile = false;
        this.loadedUserId = paramMap.get('userId');
        this.userService.getUserById(this.loadedUserId).subscribe(
          user => {
            this.loadedUser = user;
            this.authService.user.pipe(take(1)).subscribe(currentUser => {
              if (currentUser) {
                this.loggedUser = currentUser;
                this.ownProfile = currentUser.id === this.loadedUser.id;
                this.userIsLoading = false;
                this.fetchLoadedUserData();
              } else {
                this.userIsLoading = false;
                this.fetchLoadedUserData();
              }
            });
          },
          error => {
            console.log("getUserError", error);
            this.showALert();
          }
        );
      }

      this.userSub = this.authService.user.subscribe(currentUser => {
        this.loggedUser = currentUser;
      });

      this.countryService.fetchCountries().subscribe(countries => {
        if (countries) this.countries = countries;
      });
    });
  }


  ionViewWillEnter() {
    if (this.loadedUserId && this.firstTime) {
      this.gamesAreLoading = true;
      this.eventsAreLoading = true;
      this.userIsLoading = true;
      this.userService.getUserById(this.loadedUserId).subscribe(user => {
        this.loadedUser = user;
        this.userIsLoading = false;
        this.fetchLoadedUserData();
      }, error => {
        console.log("getUserError", error);
        this.showALert();
      });
    } else {
      this.firstTime = true;
    }
  }

  fetchLoadedUserData() {
    this.authService.user.subscribe(currentUser => {
      this.loggedUser = currentUser;
    });

    this.gamesService.fetchOwnGames(this.loadedUserId).subscribe(games => {
      this.loadedOwnGames = games;
      this.gamesAreLoading = false;
    });

    this.eventsService.fetchOwnEvents(this.loadedUserId).subscribe(events => {
      this.loadedOwnEvents = events;
      this.eventsAreLoading = false;
      this.fetchJoinedEvents();
    }, error => {
      console.log(error);
      this.fetchJoinedEvents();
    });
  }

  fetchJoinedEvents() {
    if (this.loadedUser.eventsUserSignedUpFor) {
      let observables = [];
      this.loadedUser.eventsUserSignedUpFor.forEach(eventId => {
        observables.push(this.eventsService.fetchEvent(eventId).pipe(
          catchError((error) => {
            return of(null);
          }),
          switchMap(event => {
            return of(event);
          }))
        );
      });

      forkJoin(observables).subscribe(events => {
        if (events) {
          events.forEach(event => {
            if (event instanceof Event && this.loadedOwnEvents.find(e => e.id === event.id) === undefined) {
              if (this.loadedOwnEvents) {
                this.loadedOwnEvents.push(event);
              } else {
                this.loadedOwnEvents = [event];
              }
            }
          })
        }
      })
    }
  }

  editUsernameAlert() {
    this.alertCtrl.create({
      header: "Enter your new username",
      inputs: [{
        placeholder: "New username",
        type: "text",
        name: "username",
        value: this.loggedUser.username
      }],
      buttons: [
        {
          text: "Cancel",
          role: "cancel"
        },
        {
          text: "Save",
          handler: (event) => {
            this.updateUsername(event.username);
          }
        }
      ]
    }).then(
      alertEl => alertEl.present()
    )
  }

  togglePicture() {
    this.modalCtrl.create({ component: ImagePickerModalComponent, componentProps: { loadedPicture: this.loadedUser.picture}}).then(modaEl => {
      modaEl.onDidDismiss().then(modalData => {
        if (modalData.data) {
          this.updatePicture(modalData.data)
        }
      });
      modaEl.present();
    });
  }

  canAddToFriends() {
    this.connectionService.getFriends(this.loggedUser.id).pipe(take(1)).subscribe(friends => {
      return !friends.includes(this.loadedUser);
    })
  }

  createRequest() {
    let request = new Request(null, this.loggedUser.id, this.loadedUser.id);
    this.connectionService.createRequest(request).pipe(take(1)).subscribe(f => {
      console.log(f);
    });
  }

  updateUsername(username: string) {
    this.userService.updateUser(this.loggedUser.id, null, username, null, null, null, null).pipe(take(1)).subscribe()
  }

  updatePicture(picture: string | File) {
    const imageFile = this.onImagePick(picture);
    if (imageFile) {
      this.loadingCtrl.create({
        message: 'Creating new image...'
      }).then(loadingEl => {
        loadingEl.present();
        this.imageService.uploadImage(imageFile).pipe(switchMap(image => {
          return this.userService.updateUser(this.loggedUser.id, null, null, null, image.imageUrl, null, null).pipe(take(1));
        })).subscribe(res => {
          loadingEl.dismiss();
        }, error => {
          console.log("error", error);
          loadingEl.dismiss();
        })
      });
    }
  }

  deleteProfile() {
    //TODO: delete games and events
    this.authService.deleteAccount().subscribe(
      resData => {
        console.log("deleteAccount1", resData);
      },
      errRes => {
        console.log("error", errRes.error.error.message);
      });
    this.userService.deleteUser(this.loadedUser.id).subscribe(resData => {
        console.log("deleteAccount2", resData);
      },
      errRes => {
        console.log("error", errRes.error.error.message);
      });
  }

  startDeleteTheProfile() {
    this.alertCtrl
      .create({
        header: 'Are you sure you want to delete your account?',
        message: 'The events and games you created will not be available.',
        buttons: [
          {
            text: "Cancel",
            role: "cancel",
          },
          {
            text: "Delete",
            role: "delete",
            handler: () => {
              this.deleteProfile();
            }
          }
        ]
      })
      .then(alertEl => alertEl.present());
  }

  updateGames(games: Game[]) {
    if (games) {
      this.loadedOwnGames = games;
    }
  }

  showALert() {
    this.alertCtrl
      .create(
        {
          header: 'An error occured',
          message: 'User could not be fetched. Please try again later.',
          buttons: [{
            text: 'Okay', handler: () => {
              this.navCtrl.pop();
            }
          }]
        })
      .then(alertEl => {
        alertEl.present();
      });
  }

  selectCountry() {
    this.modalCtrl.create({ component: PickAThingComponent, componentProps: {
        countries: this.countries,
        selectedCountry: this.loggedUser.country
      }}).then(modalEl => {
      modalEl.onDidDismiss().then(modal => {
        if (modal.data) {
          this.userService.updateUser(
            this.loggedUser.id,
            null,
            null,
            modal.data,
            null,
            null,
            null
          ).pipe(take(1)).subscribe();
        }
      });
      modalEl.present();
    })
  }

  onFilterUpdate(event) {
    this.listGames = (event.detail.value === 'games');
  }

  onImagePick(imageData: string | File | Blob) {
    let imageFile;
    if (typeof imageData === 'string') {
      try {
        imageFile = this.imageService.convertbase64toBlob(imageData);
      } catch (error) {
        console.log("error", error);
        return;
      }
    } else {
      imageFile = imageData
    }
    return imageFile;
  }

  showSettings() {
    this.modalCtrl.create({component: SettingsComponent, componentProps: { user: this.loggedUser }}).then(modalEl => {
      modalEl.present();
    });
  }

  ngOnDestroy() {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
  }
}

