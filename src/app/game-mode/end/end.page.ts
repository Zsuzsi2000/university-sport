import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from "@angular/router";
import {LiveGameService} from "../live-game.service";
import {AlertController, NavController} from "@ionic/angular";
import {Player} from "../../models/Player";
import {switchMap, take} from "rxjs/operators";
import {GamesService} from "../../games/games.service";
import {Game} from "../../models/game.model";
import {AuthService} from "../../auth/auth.service";
import {forkJoin, interval, of, Subscription} from "rxjs";

@Component({
  selector: 'app-end',
  templateUrl: './end.page.html',
  styleUrls: ['./end.page.scss'],
})
export class EndPage implements OnInit {

  liveGameId: string;
  playerId: string;
  isLoading = true;
  game: Game;
  players: Player[] = [];
  playersSub: Subscription;
  player: Player;
  userName: string;
  sortType = "Score";
  helps = 0;
  first = false;

  constructor(private activatedRoute: ActivatedRoute,
              private liveGameService: LiveGameService,
              private navCtrl: NavController,
              private router: Router,
              private gameService: GamesService,
              private alertController: AlertController,
              private authService: AuthService) {
  }

  ngOnInit() {
    this.activatedRoute.paramMap.subscribe(paramMap => {
      if (!paramMap.has('liveGame')) {
        this.navCtrl.pop();
        return;
      }
      this.liveGameId = paramMap.get('liveGame');
      if (this.activatedRoute.snapshot.queryParamMap.has('playerId')) {
        this.playerId = this.activatedRoute.snapshot.queryParamMap.get('playerId');
      }
      this.liveGameService.fetchPlayers().pipe(take(1)).subscribe(players => {
        this.players = (players as Player[]).filter(p => p.liveGameId === this.liveGameId);
        this.player = (players as Player[]).find(p => p.id === this.playerId);
        this.player.checkpointsState.forEach(check => {
          if (check.useHelp) this.helps += 1;
        });
        if (!this.first) {
          this.updateGame();
        }
      });

      this.liveGameService.fetchLiveGame(this.liveGameId).pipe(take(1)).subscribe(liveGame => {
        if (liveGame) {
          this.gameService.fetchGame(liveGame.gameId).pipe(take(1)).subscribe(game => {
            if (game) {
              this.game = game;
              this.sortType = this.game.quiz ?  "Score" : "BigDuration";

              console.log(game);
              this.authService.user.pipe(take(1)).subscribe(user => {
                if (user) {
                  this.userName = user.username;
                }
                if (!this.first) {
                  this.updateGame();
                }
              })
            }
          })
        }
      });

      this.playersSub = interval(5000).pipe(
        switchMap(() => {
          return this.liveGameService.fetchPlayers();
        })
      ).subscribe(players => {
        this.players = (players as Player[]).filter(p => p.liveGameId === this.liveGameId);
        if (this.sortType === "Score") {
          this.players = this.players.sort((a, b) => a.score < b.score ? 1 : (a.score > b.score ? -1 : 0));
        } else if (this.sortType === "BigDuration") {
          this.players = this.players.sort((a, b) => a.duration < b.duration ? -1 : (a.duration > b.duration ? 1 : 0));
        } else {
          this.players = this.players.sort((a, b) => a.checkpointsDuration < b.checkpointsDuration ? -1 : (a.checkpointsDuration > b.checkpointsDuration ? 1 : 0));
        }
      })
    });
  }

  updateGame() {
    forkJoin([of(this.player), of(this.game)]).subscribe(([player, game]) => {
      this.isLoading = false;
      console.log('Performing additional action with player and game:', player, game);
      if (game && player) {
        this.first = true;
        console.log('Performing additional action with player and game:', player, game);

        if (this.game.bests) {
          if (this.game.bests.score < this.player.score && this.game.quiz) {
            this.game.bests.score = this.player.score;
            this.congratulations('score');
          }
          if (this.game.bests.duration > this.player.duration) {
            this.game.bests.duration = this.player.duration;
            this.congratulations('duration');
          }
          if (this.game.bests.checkpointDuration > this.player.checkpointsDuration && this.game.quiz) {
            this.game.bests.checkpointDuration = this.player.checkpointsDuration;
            this.congratulations('checkpoints duration');
          }
        } else {
          this.game.bests = {
            score: this.player.score ? this.player.score : null,
            duration: this.player.duration ? this.player.duration : null,
            checkpointDuration: this.player.checkpointsDuration ? this.player.checkpointsDuration : null,
          };
        }

        this.gameService.updateGame(this.game.id, this.game.name, this.game.locationType, this.game.locationIdentification,
          this.game.country, this.game.pointOfDeparture, this.game.category, this.game.quiz, this.game.description,
          this.game.imgUrl, this.game.distance, this.game.duration, this.game.itIsPublic, this.game.mapUrl,
          this.game.checkpoints, this.game.numberOfAttempts + 1, this.game.creationDate, this.game.ratings, this.game.bests).pipe(take(1)).subscribe(c => console.log(c));
      }
    });
  }

  congratulations(type: string) {
    let message = "You set a new " + type + " record!";
    console.log(message);

    this.alertController.create({
      header: "Congratulations!",
      message: message,
      buttons: ["Thanks"]
    }).then(
      alertEl => alertEl.present()
    );
  }

  sort(event) {
    console.log(event.detail.value);
    this.sortType = event.detail.value;
    if (event.detail.value === "Score") {
      this.players = this.players.sort((a, b) => a.score < b.score ? 1 : (a.score > b.score ? -1 : 0));
    } else if (event.detail.value === "BigDuration") {
      this.players = this.players.sort((a, b) => a.duration < b.duration ? -1 : (a.duration > b.duration ? 1 : 0));
    } else {
      this.players = this.players.sort((a, b) => a.checkpointsDuration < b.checkpointsDuration ? -1 : (a.checkpointsDuration > b.checkpointsDuration ? 1 : 0));
    }
  }

  backToMenu() {
    this.players.forEach(player => {
      this.liveGameService.deletePlayer(player.id).subscribe(d => {
        console.log(d);
      });
    });

    this.liveGameService.deleteLiveGame(this.liveGameId).subscribe(d => {
      console.log(d);
      this.router.navigate(['/', 'games']);
    });

  }

  addRating() {
    this.alertController.create({
      header: "Give a rating or write your opinion",
      inputs: [{
        placeholder: "Rating",
        type: "text",
        name: "rating",
      }],
      buttons: [
        {
          text: "Cancel",
          role: "cancel"
        },
        {
          text: "Go",
          handler: (event) => {
            console.log(event.rating);
            if (this.game.ratings) {
              this.game.ratings.push({username: this.userName, text: event.rating});
            } else {
              this.game.ratings = [{username: this.userName, text: event.rating}];
            }

            this.gameService.updateGame(this.game.id, this.game.name, this.game.locationType, this.game.locationIdentification,
              this.game.country, this.game.pointOfDeparture, this.game.category, this.game.quiz, this.game.description,
              this.game.imgUrl, this.game.distance, this.game.duration, this.game.itIsPublic, this.game.mapUrl,
              this.game.checkpoints, this.game.numberOfAttempts, this.game.creationDate, this.game.ratings).pipe(take(1)).subscribe(c => console.log(c));
          }
        }
      ]
    }).then(
      alertEl => alertEl.present()
    );
  }

  transform(duration: number): string {
    const hours = Math.floor(duration / (60 * 60 * 1000));
    const minutes = Math.floor((duration % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((duration % (60 * 1000)) / 1000);

    const formattedHours = this.padZero(hours);
    const formattedMinutes = this.padZero(minutes);
    const formattedSeconds = this.padZero(seconds);

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
  }

  private padZero(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  getHelp(player: Player) {
    return player.checkpointsState.filter(check => check.useHelp).length;
  }

  checkDone(player: Player) {
    let state = player.checkpointsState.find(p=> p.done === false);
    return state === undefined;
  }

  ngOnDestroy(): void {
    // this.players.forEach(player => {
    //   this.liveGameService.deletePlayer(player.id).subscribe(d => {
    //     console.log(d);
    //   });
    // });
    //
    // this.liveGameService.deleteLiveGame(this.liveGameId).subscribe(d => {
    //   console.log(d);
    // });
  }

  ionViewDidLeave() {
    if (this.playersSub) this.playersSub.unsubscribe();
  }


}